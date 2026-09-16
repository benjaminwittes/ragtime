/**
 * The conversation: turns, the accepted brief, the envelope and message
 * history the worker hands back, and the one running turn. Everything the
 * page decides about phases lives here (design item 8): a follow-up after
 * research stays in research with the same brief; only an edited brief
 * starts a new research phase; "start over" is the only way to a new
 * conversation. No automatic re-orient in beta.
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
import { DRAFT_KEY, PERSIST_VERSION, STORAGE_KEY, pack, restore, type Saved } from '../model/persist.ts'
import { readLocal, removeLocal, writeLocal } from '../storage.ts'
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
  totalCalls: number
  ask(text: string): Promise<void>
  accept(brief: ExplorerBrief): Promise<void>
  startOver(): void
  togglePin(slug: string): void
}

const ACCEPT_PROMPT = 'Proceed with the brief as shown.'
const NO_CREDENTIAL = 'Sign in, add an Anthropic key, or enter the demo password to ask.'

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
  const [saved] = useState<Saved | null>(() => restore(readLocal(STORAGE_KEY), Date.now()))
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

  const saveNow = useCallback(() => {
    const s = stateRef.current
    // Pins with no turns are still a conversation being set up, and worth keeping. Only
    // an empty everything clears the key — otherwise "start over" and "never started"
    // would be told apart by nothing.
    if (!s.turns.length && !s.pinned.length && !s.brief) {
      removeLocal(STORAGE_KEY)
      return
    }
    const raw = pack({
      v: PERSIST_VERSION,
      turns: s.turns,
      brief: s.brief,
      proposed: s.proposed,
      pinned: s.pinned,
      messages: conv.current.messages,
      envelope: conv.current.envelope,
      savedAt: Date.now(),
    })
    if (raw) writeLocal(STORAGE_KEY, raw)
  }, [])

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

  const startOver = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    turnsRef.current = []
    setTurns([])
    setBrief(null)
    setProposed(null)
    setRefusal(null)
    setBusy(false)
    conv.current = { messages: [], envelope: null }
    // Start over is the only thing that forgets, so it has to forget on the device too —
    // otherwise the next visit restores the conversation the reader just discarded. The
    // draft goes with it: it was typed at that conversation, not at the next one.
    removeLocal(STORAGE_KEY)
    removeLocal(DRAFT_KEY)
  }, [])

  const togglePin = useCallback((slug: string) => {
    setPinned((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : p.concat(slug)))
  }, [])

  const totalCalls = turns.reduce((n, t) => n + t.calls, 0)

  return { turns, brief, proposed, phase, awaitingReply, busy, refusal, registry, pinned, totalCalls, ask, accept, startOver, togglePin }
}
