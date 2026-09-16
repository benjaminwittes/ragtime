/**
 * The conversation: turns, the accepted brief, the envelope and message
 * history the worker hands back, and the one running turn. Everything the
 * page decides about phases lives here (design item 8): a follow-up after
 * research stays in research with the same brief; only an edited brief
 * starts a new research phase. No automatic re-orient in beta.
 *
 * And the conversations either side of it. `startNew` sets this one aside
 * rather than destroying it, `open` goes back to one, and `forget` is the
 * only verb here that loses anything — `model/conversations.ts` holds the
 * rules and this file does the reading and writing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExplorerTurnError,
  continueFrom,
  createClient,
  type AuthArg,
  type CorpusRegistry,
  type ExplorerBrief,
  type ExplorerMessage,
  type ExplorerPhase,
  type ExplorerTurnRequest,
} from '@lawfare/ragtime-client'

import { explainRefusal } from '../model/allowance.ts'
import { mergePinnedCorpora, normalizeBrief } from '../model/brief.ts'
import {
  CONVERSATION_PREFIX,
  INDEX_KEY,
  conversationKey,
  evict,
  readIndex,
  reconcile,
  spendOf,
  summarize,
  upsert,
  type Index,
  type Summary,
} from '../model/conversations.ts'
import { DRAFT_KEY, PERSIST_VERSION, STORAGE_KEY, fit, restore, type Saved } from '../model/persist.ts'
import { keysLocal, readLocal, removeLocal, writeLocal } from '../storage.ts'
import { applyEvent, newTurn, type PromptKind, type Turn } from '../model/turn.ts'

export type Refusal = { status: number; code: string | null; message: string }

export type Explorer = {
  turns: Turn[]
  /** The brief research runs against; null until one is accepted. */
  brief: ExplorerBrief | null
  /** The latest proposal not yet accepted, with the pinned corpora merged in. */
  proposed: ExplorerBrief | null
  phase: ExplorerPhase
  awaitingReply: boolean
  busy: boolean
  refusal: Refusal | null
  registry: CorpusRegistry | null
  pinned: string[]
  /** The conversation on the screen. */
  cid: string
  /** Every conversation on this device, newest first — this one among them. */
  conversations: Summary[]
  ask(text: string): Promise<void>
  accept(brief: ExplorerBrief): Promise<void>
  /** Set this conversation aside and begin another. Nothing is destroyed. */
  startNew(): void
  /** Return to one that was set aside. */
  open(cid: string): void
  /** Throw one away on purpose — the only thing here that destroys. */
  forget(cid: string): void
  togglePin(slug: string): void
}

const ACCEPT_PROMPT = 'Proceed with the brief as shown.'
const NO_CREDENTIAL = 'Sign in, add an Anthropic key, or enter the demo password to ask.'

/** An id for a conversation. Only has to be unique on one device. */
function newConversationId(): string {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

/**
 * What this device already has, read once before the first paint.
 *
 * Three things happen here and each is a way a reader could otherwise lose work. The
 * index is **reconciled** against the blobs actually present, so no row in the list opens
 * an empty page. Any blob with no row is **adopted**, which is what makes the index a
 * cache — lose it and the conversations are still found. And the **legacy** single
 * conversation, the one key this page used before there was a list, becomes the first
 * conversation of that list rather than being orphaned by the rename.
 */
function boot(now: number): { cid: string; index: Index; saved: Saved | null } {
  const prefix = CONVERSATION_PREFIX + ':'
  const present = keysLocal(prefix).map((k) => k.slice(prefix.length))
  let index = reconcile(readIndex(readLocal(INDEX_KEY)), (cid) => present.includes(cid))

  for (const cid of present) {
    if (index.items.some((i) => i.cid === cid)) continue
    const raw = readLocal(conversationKey(cid))
    const s = raw ? restore(raw, now) : null
    if (s && raw) index = upsert(index, summarize(cid, s, raw.length, spendOf(s.turns)))
    else removeLocal(conversationKey(cid))
  }

  const legacy = readLocal(STORAGE_KEY)
  if (legacy) {
    const s = restore(legacy, now)
    if (s) {
      const cid = newConversationId()
      if (writeLocal(conversationKey(cid), legacy)) {
        index = { ...upsert(index, summarize(cid, s, legacy.length, spendOf(s.turns))), current: cid }
        removeLocal(STORAGE_KEY)
      }
    } else {
      removeLocal(STORAGE_KEY)
    }
  }

  const current = index.current && index.items.some((i) => i.cid === index.current) ? index.current : null
  if (current) {
    const s = restore(readLocal(conversationKey(current)), now)
    if (s) return { cid: current, index, saved: s }
  }
  // Nothing to resume. A new id, and the ones set aside still listed beside it.
  const cid = newConversationId()
  return { cid, index: { ...index, current: cid }, saved: null }
}

export type ExplorerOptions = {
  /** The worker origin. */
  workerUrl: string
  /**
   * What every turn is sent with: the credential the app resolved (`useAuth()` — a
   * signed-in account, a bring-your-own Anthropic key, or the demo password), or null
   * when it has none, in which case a turn is refused here before anything is sent.
   */
  auth: AuthArg | null
}

export function useExplorer({ workerUrl, auth }: ExplorerOptions): Explorer {
  const client = useMemo(() => createClient({ baseUrl: workerUrl }), [workerUrl])
  // Read once, at the first render, rather than in an effect: an effect would paint the
  // empty state first and then replace it, so a reader coming back would watch their own
  // conversation appear to be gone before it appeared to return.
  const [booted] = useState(() => boot(Date.now()))
  const saved = booted.saved
  const [cid, setCid] = useState(booted.cid)
  const [conversations, setConversations] = useState<Summary[]>(booted.index.items)
  const [turns, setTurns] = useState<Turn[]>(() => saved?.turns ?? [])
  const [brief, setBrief] = useState<ExplorerBrief | null>(() => saved?.brief ?? null)
  const [proposed, setProposed] = useState<ExplorerBrief | null>(() => saved?.proposed ?? null)
  const [pinned, setPinned] = useState<string[]>(() => saved?.pinned ?? [])
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [registry, setRegistry] = useState<CorpusRegistry | null>(null)

  const turnsRef = useRef<Turn[]>(saved?.turns ?? [])
  const pinnedRef = useRef<string[]>(saved?.pinned ?? [])
  // The conversation as the worker continues it, not as the page draws it. Restored
  // together with the turns or neither is true (`model/persist.ts`).
  const conv = useRef<{ messages: ExplorerMessage[]; envelope: string | null }>({
    messages: saved?.messages ?? [],
    envelope: saved?.envelope ?? null,
  })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])
  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  // The latest of everything worth keeping, readable from a listener that fires long after
  // the render it belongs to — `pagehide` has no time to wait for React. Synced in an
  // effect rather than assigned during render, like `turnsRef` above: a ref written while
  // rendering is the thing `react-hooks/refs` refuses, and rightly.
  const stateRef = useRef({ turns, brief, proposed, pinned })
  useEffect(() => {
    stateRef.current = { turns, brief, proposed, pinned }
  }, [turns, brief, proposed, pinned])

  // The same reason `stateRef` exists: `pagehide` fires long after the render that knew
  // which conversation was open and what else was on the device.
  const cidRef = useRef(cid)
  useEffect(() => {
    cidRef.current = cid
  }, [cid])
  const indexRef = useRef<Index>(booted.index)

  /** The index, to the device and to the list, in one place so the two cannot disagree. */
  const writtenRef = useRef<string | null>(null)
  const commitIndex = useCallback((next: Index) => {
    indexRef.current = next
    const raw = JSON.stringify(next)
    // A first visit with nothing on it still runs the save effect once, and every settled
    // turn commits again. Writing a byte-identical index is a write nobody asked for.
    if (raw !== writtenRef.current) {
      writtenRef.current = raw
      writeLocal(INDEX_KEY, raw)
    }
    setConversations(next.items)
  }, [])

  const saveNow = useCallback(() => {
    const s = stateRef.current
    const c = cidRef.current
    // Pins with no turns are still a conversation being set up, and worth keeping. Only
    // an empty everything clears the key — otherwise "started and emptied" and "never
    // started" would be told apart by nothing. An empty conversation is not listed
    // either: a row that opens nothing is worse than no row.
    if (!s.turns.length && !s.pinned.length && !s.brief) {
      removeLocal(conversationKey(c))
      commitIndex({ ...indexRef.current, current: c, items: indexRef.current.items.filter((i) => i.cid !== c) })
      return
    }
    const savedAt = Date.now()
    const packed = fit({
      v: PERSIST_VERSION,
      turns: s.turns,
      brief: s.brief,
      proposed: s.proposed,
      pinned: s.pinned,
      messages: conv.current.messages,
      envelope: conv.current.envelope,
      savedAt,
    })
    if (!packed) return
    // Summarised from what was actually written, never from what was offered: over budget
    // `fit` drops the oldest turns, and a list promising turns the blob no longer holds
    // would be the same lie this whole file exists to stop telling.
    const summary = summarize(c, packed.saved, packed.raw.length, spendOf(packed.saved.turns))
    let next = upsert({ ...indexRef.current, current: c }, summary)

    if (!writeLocal(conversationKey(c), packed.raw)) {
      // The origin is full. What the reader is doing now is worth more than what they
      // did last week, so the oldest go and the write is tried once more — under a
      // budget of nothing, which asks for every conversation but this one.
      const { index: freed, drop } = evict(next, 0, 1)
      for (const d of drop) removeLocal(conversationKey(d))
      next = freed
      if (!writeLocal(conversationKey(c), packed.raw)) {
        commitIndex({ ...next, items: next.items.filter((i) => i.cid !== c) })
        return
      }
    }
    const { index: kept, drop } = evict(next)
    for (const d of drop) removeLocal(conversationKey(d))
    commitIndex(kept)
  }, [commitIndex])

  // Saved when a turn settles, not while it streams: a running turn writes on every token,
  // and the thing being written is the whole conversation.
  useEffect(() => {
    if (busy) return
    saveNow()
  }, [turns, brief, proposed, pinned, busy, saveNow])

  /**
   * And once more on the way out, which is the case this whole file exists for.
   *
   * `pagehide` and a `visibilitychange` to hidden, rather than `beforeunload`: iOS does not
   * reliably fire `beforeunload`, and the way a phone loses a tab is not an unload at all —
   * it is backgrounded, and then discarded later with no event of any kind. `hidden` is the
   * last moment the page is certain to get, so it is the one that has to write. This is
   * also the only path that saves a turn mid-stream, which is why `settle` exists: what it
   * writes is a running turn, and what comes back has to be an interrupted one.
   */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    window.addEventListener('pagehide', saveNow)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', saveNow)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [saveNow])

  useEffect(() => {
    let alive = true
    client
      .registry()
      .then((r) => {
        if (alive) setRegistry(r)
      })
      .catch(() => {
        /* the empty state shows without chips */
      })
    return () => {
      alive = false
    }
  }, [client])

  const phase: ExplorerPhase = brief ? 'research' : 'orient'
  const last = turns.length ? turns[turns.length - 1]! : null
  const awaitingReply = !!last && last.phase === 'orient' && !!last.question && !last.running

  const run = useCallback(
    async (turnPhase: ExplorerPhase, prompt: string, promptKind: PromptKind, briefToUse: ExplorerBrief | null) => {
      if (!auth) {
        setRefusal({ status: 0, code: 'no_credential', message: NO_CREDENTIAL })
        return
      }
      let turn = newTurn(turnsRef.current.length + 1, turnPhase, prompt, promptKind, Date.now())
      turnsRef.current = turnsRef.current.concat(turn)
      setTurns(turnsRef.current)
      setBusy(true)
      setRefusal(null)
      const commit = (t: Turn) => {
        turn = t
        setTurns((prev) => prev.map((x) => (x.index === t.index ? t : x)))
      }
      const messages = conv.current.messages.concat({ role: 'user', content: prompt })
      const req: ExplorerTurnRequest = { phase: turnPhase, messages, envelope: conv.current.envelope }
      if (turnPhase === 'research' && briefToUse) req.brief = briefToUse
      const ac = new AbortController()
      abort.current = ac
      const events = client.explorer.turn(req, auth, { signal: ac.signal })
      try {
        for await (const ev of events) {
          commit(applyEvent(turn, ev, Date.now()))
          if (ev.type === 'phase' && ev.outcome === 'brief' && ev.brief) setProposed(mergePinnedCorpora(ev.brief, pinnedRef.current))
          if (ev.type === 'done') {
            const next = continueFrom(messages, ev)
            conv.current = { messages: next.messages, envelope: next.envelope }
          }
        }
        if (turn.running) {
          commit({
            ...turn,
            running: false,
            endedAt: Date.now(),
            stop: 'error',
            error: turn.error ?? { type: 'error', code: 'stream_ended', message: 'The stream ended before the turn was done.', retryable: true },
          })
        }
      } catch (err) {
        if (ac.signal.aborted) return
        const raw: Refusal =
          err instanceof ExplorerTurnError
            ? { status: err.status, code: err.code, message: err.message }
            : { status: 0, code: 'network', message: err instanceof Error ? err.message : String(err) }
        // Rewritten once, here, so the band and the turn's own error block say the same
        // thing. On the site the allowance is the visitor's own — nothing is mounted
        // behind a shared gate — so the shared-pool wording never applies
        // (`model/allowance.ts`).
        const r: Refusal = { ...raw, message: explainRefusal(raw.code, raw.message, false) }
        setRefusal(r)
        commit({
          ...turn,
          running: false,
          endedAt: Date.now(),
          stop: r.code === 'cap_cents' ? 'cap_cents' : 'error',
          error: { type: 'error', code: r.code ?? 'network', message: r.message, retryable: r.status === 0 || r.status >= 500 },
        })
      } finally {
        if (abort.current === ac) abort.current = null
        setBusy(false)
      }
    },
    [client, auth],
  )

  const ask = useCallback(
    (text: string) => run(phase, text, awaitingReply ? 'reply' : 'ask', brief),
    [run, phase, awaitingReply, brief],
  )

  const accept = useCallback(
    (b: ExplorerBrief) => {
      const nb = normalizeBrief(b)
      setBrief(nb)
      setProposed(null)
      return run('research', ACCEPT_PROMPT, 'accept', nb)
    },
    [run],
  )

  /** Put whatever is on the screen into `state`, and stop whatever is running. */
  const show = useCallback((s: Saved | null) => {
    abort.current?.abort()
    abort.current = null
    turnsRef.current = s?.turns ?? []
    pinnedRef.current = s?.pinned ?? []
    setTurns(s?.turns ?? [])
    setBrief(s?.brief ?? null)
    setProposed(s?.proposed ?? null)
    setPinned(s?.pinned ?? [])
    setRefusal(null)
    setBusy(false)
    conv.current = { messages: s?.messages ?? [], envelope: s?.envelope ?? null }
    // The draft was typed at the conversation being left, not at the one being opened.
    removeLocal(DRAFT_KEY)
  }, [])

  /**
   * Begin another conversation.
   *
   * This is what "start over" used to be, and the difference is the whole point: the one
   * being left is written down first and stays in the list. A research turn costs real
   * money, and the old behaviour threw the answer away on one tap with no confirmation
   * and no way back.
   */
  const startNew = useCallback(() => {
    saveNow()
    const next = newConversationId()
    setCid(next)
    cidRef.current = next
    commitIndex({ ...indexRef.current, current: next })
    show(null)
  }, [commitIndex, saveNow, show])

  /** Return to one that was set aside. The one being left is written down first. */
  const open = useCallback(
    (target: string) => {
      if (target === cidRef.current) return
      saveNow()
      const s = restore(readLocal(conversationKey(target)), Date.now())
      if (!s) {
        // The row outlived its blob. Drop it rather than opening an empty page.
        commitIndex({ ...indexRef.current, items: indexRef.current.items.filter((i) => i.cid !== target) })
        return
      }
      setCid(target)
      cidRef.current = target
      commitIndex({ ...indexRef.current, current: target })
      show(s)
    },
    [commitIndex, saveNow, show],
  )

  /** Throw one away. The only thing here that destroys, and it is always asked for. */
  const forget = useCallback(
    (target: string) => {
      removeLocal(conversationKey(target))
      const items = indexRef.current.items.filter((i) => i.cid !== target)
      if (target !== cidRef.current) {
        commitIndex({ ...indexRef.current, items })
        return
      }
      // Forgetting the one on the screen leaves the page on a conversation that no longer
      // exists, so it becomes a new one — which is what the reader asked for by emptying it.
      const next = newConversationId()
      setCid(next)
      cidRef.current = next
      commitIndex({ ...indexRef.current, current: next, items })
      show(null)
    },
    [commitIndex, show],
  )

  const togglePin = useCallback((slug: string) => {
    setPinned((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : p.concat(slug)))
  }, [])

  return { turns, brief, proposed, phase, awaitingReply, busy, refusal, registry, pinned, cid, conversations, ask, accept, startNew, open, forget, togglePin }
}
