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
  const [turns, setTurns] = useState<Turn[]>([])
  const [brief, setBrief] = useState<ExplorerBrief | null>(null)
  const [proposed, setProposed] = useState<ExplorerBrief | null>(null)
  const [pinned, setPinned] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [registry, setRegistry] = useState<CorpusRegistry | null>(null)

  const turnsRef = useRef<Turn[]>([])
  const pinnedRef = useRef<string[]>([])
  const conv = useRef<{ messages: ExplorerMessage[]; envelope: string | null }>({ messages: [], envelope: null })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])
  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

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
  }, [])

  const togglePin = useCallback((slug: string) => {
    setPinned((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : p.concat(slug)))
  }, [])

  const totalCalls = turns.reduce((n, t) => n + t.calls, 0)

  return { turns, brief, proposed, phase, awaitingReply, busy, refusal, registry, pinned, totalCalls, ask, accept, startOver, togglePin }
}
