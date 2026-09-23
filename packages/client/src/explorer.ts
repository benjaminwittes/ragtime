/**
 * `POST /explorer/turn` (contract §1–§4, frozen 2026-09-08 on ragtime-dev#168;
 * worker/explorer.js in ragtime-worker#115) as an AsyncIterable of typed events.
 *
 * One request per user turn. The worker is stateless: the caller sends the
 * Messages-API conversation and the signed envelope from the last `done`, and
 * gets both back on this turn's `done`. This module parses the
 * `text/event-stream` reply into `ExplorerEvent`s and nothing more — it never
 * inspects the envelope (opaque) or the history blocks (appended verbatim).
 *
 * Ordering the worker guarantees, which a renderer may rely on:
 *   1. `phase` is the first event of every turn (a second one carries the
 *      orient outcome once known).
 *   2. `cost` follows every `tool_result` and precedes `done`.
 *   3. `done` is the last event of every turn, including after `error`.
 *   4. A `tool_result` with `ok: false` is still a result; parallel calls in
 *      one assistant message each get their own call/result pair.
 */

import { type AuthArg, authCredentialBody, authHeaders } from './auth-arg.ts'
import { workerUrl } from './config.ts'

export type ExplorerPhase = 'orient' | 'research'

/** What orient proposes and the user accepts (edited or not) before research spends. */
export type ExplorerBrief = {
  /** One sentence, the user's words tidied. */
  goal: string
  /** Registry slugs, ordered by promise. The worker validates them. */
  corpora: string[]
  /** What would count as an answer: a list, a count, a narrative, a document. */
  answer_shape: string
  /** Optional: dates, jurisdictions, parties. */
  constraints?: string[]
}

/**
 * A Messages-API content block. Typed loosely on purpose: this package
 * appends what `done.history` returns and sends it back next turn; it never
 * reads inside a block.
 */
export type ExplorerContentBlock = { type: string; [key: string]: unknown }

export type ExplorerMessage = {
  role: 'user' | 'assistant'
  content: string | ExplorerContentBlock[]
}

export type ExplorerTurnRequest = {
  phase: ExplorerPhase
  /** The whole conversation so far; the last message must be the user's. */
  messages: ExplorerMessage[]
  /** From the previous turn's `done`; absent on the first turn of a conversation. */
  envelope?: string | null
  /** Required when `phase` is `research`. */
  brief?: ExplorerBrief
}

export type ExplorerStop = 'end_turn' | 'question' | 'step_cap' | 'cap_cents' | 'error'
export type ExplorerHandoffKind = 'workspace' | 'document'

export type ExplorerPhaseEvent = {
  type: 'phase'
  phase: ExplorerPhase
  /** Present on the second `phase` event of an orient turn. */
  outcome?: 'question' | 'brief'
  question?: string
  brief?: ExplorerBrief
}
export type ExplorerTextEvent = { type: 'text'; delta: string }
export type ExplorerToolCallEvent = {
  type: 'tool_call'
  step: number
  id: string
  name: string
  input: Record<string, unknown>
}
/** One corpus's share of a search result: how many hits, and the first few by title. */
export type ExplorerToolHit = {
  corpus: string
  count: number
  /** Up to three, in result order. `id` is what `links.document` takes. */
  top: { id: string | number | null; title: string | null }[]
}

/**
 * What a tool result amounts to, structured per tool family (design item 5
 * on ragtime-dev#168; contract §9 row 9). A sibling of the one-line
 * `summary`, which the worker renders from this same object. Absent on a
 * failed result.
 */
export type ExplorerToolDetail =
  /** search_keyword, probe, search_semantic, filter_corpus, find_similar: every corpus searched, zero hits or not. */
  | { kind: 'search'; hits: ExplorerToolHit[]; total: number }
  /** fetch_documents: a title per id; `chars` is what the model was given to read (full mode). */
  | {
      kind: 'documents'
      corpus: string | null
      mode: 'metadata' | 'full'
      count: number
      documents: { id: string | number | null; title: string | null; chars?: number; error?: string }[]
    }
  /** get_facets: the filter vocabulary and the corpus's size. */
  | {
      kind: 'facets'
      corpus: string | null
      field_count: number
      fields: string[]
      document_count: number | null
      /** Each facet group the route returned and how many values it has. */
      facets: { name: string; values: number }[]
    }
  /** ask_corpus: a billed plan awaiting execute. */
  | { kind: 'plan'; queries: number; estimated_cost_cents: number; has_token: boolean }
  /** ask_corpus_execute, ask_hub_execute, summarize_document: a billed synthesis. */
  | { kind: 'answer'; chars: number; citations: number; candor: number; cost_cents: number }
  /** Anything else, or a result that was not JSON. */
  | { kind: 'text'; chars: number }

export type ExplorerToolResultEvent = {
  type: 'tool_result'
  step: number
  id: string
  name: string
  ok: boolean
  /** One line the trail can render: per-corpus hit counts for searches, titles for fetches, field count for facets. */
  summary: string
  /** The structured sibling of `summary`; present when `ok`. A worker deployed before the field omits it. */
  detail?: ExplorerToolDetail
  corpus?: string
  /** Up to 50 result ids, when the result was for one corpus. */
  ids?: (string | number)[]
  count?: number
  /** Cents the tool itself billed (the AI tools); 0 for the free ones. */
  cost_cents: number
  ms: number
}
export type ExplorerHandoffEvent = {
  type: 'handoff'
  kind: ExplorerHandoffKind
  /** Origin-relative, in the §5 grammar. */
  url: string
  label: string
}
export type ExplorerCostEvent = {
  type: 'cost'
  /** Exact cents this turn so far (four decimals). */
  turn_cents: number
  /** Integer cents, the ceiling of `conversation_spend`; what the cap compares against. */
  conversation_cents: number
  /** Exact cents for the conversation (four decimals). */
  conversation_spend: number
  cap_cents: number
  steps: number
  step_cap: number
  /**
   * Model calls charged today against the caller's daily allowance, and the allowance
   * itself. Both absent from a worker deployed before ragtime-worker#118, and absent for
   * a paid caller, who has no daily allowance — so a renderer must handle their absence
   * rather than defaulting them.
   *
   * The worker counts per address per UTC day. Behind a mount that adds the credential on
   * its own side the address is the mount's, so this is one pool shared by everyone the
   * mount admits, not a limit on the reader.
   */
  ip_calls?: number
  ip_cap?: number
}
export type ExplorerErrorEvent = { type: 'error'; code: string; message: string; retryable: boolean }
export type ExplorerDoneEvent = {
  type: 'done'
  /** Opaque; send it back on the next turn. Null only if signing failed server-side. */
  envelope: string | null
  stop: ExplorerStop
  /** The blocks this turn added; append them to `messages` verbatim. */
  history: ExplorerMessage[]
  /** Model calls this turn. */
  calls: number
}
export type ExplorerKeepaliveEvent = { type: 'keepalive' }

export type ExplorerEvent =
  | ExplorerPhaseEvent
  | ExplorerTextEvent
  | ExplorerToolCallEvent
  | ExplorerToolResultEvent
  | ExplorerHandoffEvent
  | ExplorerCostEvent
  | ExplorerErrorEvent
  | ExplorerDoneEvent
  | ExplorerKeepaliveEvent

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'phase', 'text', 'tool_call', 'tool_result', 'handoff', 'cost', 'error', 'done', 'keepalive',
])

/** A JSON error before the stream opened: bad envelope, quota, missing brief, bad request. */
export class ExplorerTurnError extends Error {
  status: number
  /** The worker's `error.code` when it gave one (`bad_envelope`, `cap_cents`, `ip_quota`, `missing_brief`, …). */
  code: string | null
  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.name = 'ExplorerTurnError'
    this.status = status
    this.code = code
  }
}

export type ExplorerTurnOptions = {
  signal?: AbortSignal
  /** Injectable for tests; defaults to the global. */
  fetch?: typeof globalThis.fetch
}

/**
 * Open one turn and yield its events in order. The generator ends when the
 * stream does; `done` is the last event yielded on every successful open.
 * Throws `ExplorerTurnError` when the worker refuses the turn before
 * streaming (an ordinary JSON 4xx/5xx).
 *
 * Explorer runs Anthropic models only; the phase picks the model, so the
 * `model` an `AuthArg` carries is not sent.
 */
export async function* explorerTurn(
  req: ExplorerTurnRequest,
  auth: AuthArg,
  opts: ExplorerTurnOptions = {},
): AsyncGenerator<ExplorerEvent, void, undefined> {
  const doFetch = opts.fetch ?? globalThis.fetch
  const body: Record<string, unknown> = {
    provider: auth.mode === 'byok' ? auth.provider : 'anthropic',
    ...authCredentialBody(auth),
    phase: req.phase,
    messages: req.messages,
  }
  if (req.envelope) body.envelope = req.envelope
  if (req.brief) body.brief = req.brief

  const res = await doFetch(`${workerUrl()}/explorer/turn`, {
    method: 'POST',
    headers: { ...authHeaders(auth), accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    const text = await res.text()
    let message = text.slice(0, 300) || `HTTP ${res.status}`
    let code: string | null = null
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } }
      if (parsed.error?.message) message = parsed.error.message
      if (parsed.error?.code) code = parsed.error.code
    } catch {
      /* not JSON */
    }
    throw new ExplorerTurnError(res.status, message, code)
  }
  if (!res.body) throw new ExplorerTurnError(res.status, 'The worker returned no stream body')
  yield* parseExplorerStream(res.body)
}

/**
 * The stream parser on its own: frames are `event: <name>\ndata: <json>\n\n`.
 * Frames with an unknown event name are skipped (additive deviations are
 * allowed by the contract); frames whose data is not JSON are skipped too.
 */
export async function* parseExplorerStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ExplorerEvent, void, undefined> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // Frames end at a blank line. The worker writes "\n\n"; a proxy that
      // rewrites to CRLF is normalised here, after the append, so a "\r"
      // that ends one chunk still meets its "\n" at the start of the next.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const ev = parseFrame(frame)
        if (ev) yield ev
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) {
      const ev = parseFrame(buffer)
      if (ev) yield ev
    }
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): ExplorerEvent | null {
  let name: string | null = null
  let data: string | null = null
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) {
      const payload = line.slice(line.startsWith('data: ') ? 6 : 5)
      data = data === null ? payload : data + '\n' + payload
    }
  }
  if (!name || !EVENT_NAMES.has(name) || data === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  return { ...(parsed as Record<string, unknown>), type: name } as ExplorerEvent
}

/** What a whole turn amounts to once its events have been consumed. */
export type ExplorerTurnResult = {
  events: ExplorerEvent[]
  /** The final `done`, or null when the stream ended without one (a transport failure). */
  done: ExplorerDoneEvent | null
  /** The orient outcome, when this turn produced one. */
  outcome: ExplorerPhaseEvent | null
  /** The assistant's text this turn, concatenated from `text` deltas. */
  text: string
  /** The last `cost` event, when any. */
  cost: ExplorerCostEvent | null
  error: ExplorerErrorEvent | null
}

/**
 * Run a turn to completion, optionally observing each event as it arrives.
 * The same iteration `explorerTurn` yields, collected: for terminal drivers,
 * tests, and callers that do not render incrementally.
 */
export async function runExplorerTurn(
  req: ExplorerTurnRequest,
  auth: AuthArg,
  onEvent?: (ev: ExplorerEvent) => void,
  opts: ExplorerTurnOptions = {},
): Promise<ExplorerTurnResult> {
  const result: ExplorerTurnResult = { events: [], done: null, outcome: null, text: '', cost: null, error: null }
  for await (const ev of explorerTurn(req, auth, opts)) {
    result.events.push(ev)
    if (onEvent) onEvent(ev)
    switch (ev.type) {
      case 'text':
        result.text += ev.delta
        break
      case 'phase':
        if (ev.outcome) result.outcome = ev
        break
      case 'cost':
        result.cost = ev
        break
      case 'error':
        result.error = ev
        break
      case 'done':
        result.done = ev
        break
      default:
        break
    }
  }
  return result
}

/**
 * Continue a conversation from a finished turn: the messages to send next
 * time, with this turn's history appended, and the envelope to carry.
 */
export function continueFrom(
  messages: ExplorerMessage[],
  done: ExplorerDoneEvent,
): { messages: ExplorerMessage[]; envelope: string | null } {
  return { messages: messages.concat(done.history), envelope: done.envelope }
}
