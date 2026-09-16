/**
 * The words on the page for numbers and states: cents with one decimal and
 * never dollars (item 6), a working indicator driven by the last event
 * (item 9), the badge a stopped turn wears (item 7), the per-turn cost line.
 */

import type { ExplorerStop } from '@lawfare/ragtime-client'
import { elapsedMs, lastCost, type TrailCall, type Turn } from './turn.ts'

/** `10.3¢`; under a tenth of a cent reads `<0.1¢`; zero reads `0¢`. */
export function cents(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0¢'
  if (n < 0.05) return '<0.1¢'
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '') + '¢'
}

export function seconds(ms: number): string {
  if (ms < 950) return (Math.max(ms, 0) / 1000).toFixed(1) + ' s'
  return Math.round(ms / 1000) + ' s'
}

export function plural(n: number, word: string, words?: string): string {
  return n + ' ' + (n === 1 ? word : (words ?? word + 's'))
}

const TOOL_LABELS: Record<string, string> = {
  search_keyword: 'keyword search',
  search_semantic: 'semantic search',
  search_semantic_hub: 'cross-corpus probe',
  probe: 'cross-corpus probe',
  filter_corpus: 'filter',
  get_facets: 'facets',
  fetch_documents: 'fetch',
  ask_corpus: 'ask (plan)',
  ask_corpus_execute: 'ask (execute)',
  ask_hub_execute: 'ask across corpora',
  summarize_document: 'summarize',
  find_similar: 'similar documents',
  ask_user: 'asked a question',
  propose_brief: 'proposed a brief',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ')
}

function corporaOf(input: Record<string, unknown>): string {
  if (typeof input.corpus === 'string') return input.corpus
  if (Array.isArray(input.corpora) && input.corpora.length) return input.corpora.map(String).join(', ')
  return 'the record'
}

/** What a call in flight is doing, in a few words. */
export function toolVerb(call: Pick<TrailCall, 'name' | 'input'>): string {
  const q = typeof call.input.query === 'string' ? call.input.query : typeof call.input.question === 'string' ? call.input.question : null
  const where = corporaOf(call.input)
  switch (call.name) {
    case 'search_keyword':
    case 'search_semantic':
      return q ? `searching ${where} for “${q.length > 60 ? q.slice(0, 57) + '…' : q}”` : `searching ${where}`
    case 'probe':
    case 'search_semantic_hub':
      return 'probing the whole record'
    case 'filter_corpus':
      return `filtering ${where}`
    case 'get_facets':
      return `checking what ${where} can filter on`
    case 'fetch_documents': {
      const n = Array.isArray(call.input.ids) ? call.input.ids.length : 1
      return call.input.mode === 'full' ? `reading ${plural(n, 'document')}` : `looking up ${plural(n, 'document')}`
    }
    case 'ask_corpus':
    case 'ask_corpus_execute':
    case 'ask_hub_execute':
      return `asking ${where}`
    case 'summarize_document':
      return 'summarizing a document'
    case 'find_similar':
      return `finding similar documents in ${where}`
    case 'propose_brief':
      return 'writing the brief'
    case 'ask_user':
      return 'asking you a question'
    default:
      return toolLabel(call.name)
  }
}

/**
 * The working indicator (item 9): driven by the last event. A tool call in
 * flight names itself; a result means the model is thinking; text means it
 * is writing; the opening phase event says which phase. Keepalives keep the
 * previous label, which is why the caller passes it in.
 */
export function workingLabel(turn: Turn, previous: string): string {
  const ev = turn.lastEvent
  if (!ev) return turn.phase === 'orient' ? 'getting oriented…' : 'researching…'
  switch (ev.type) {
    case 'phase':
      if (ev.outcome) return 'finishing…'
      return ev.phase === 'orient' ? 'getting oriented…' : 'researching…'
    case 'tool_call':
      return toolVerb({ name: ev.name, input: ev.input }) + '…'
    case 'tool_result': {
      // Other calls of the same round may still be running.
      const round = turn.rounds.find((r) => r.step === ev.step)
      const pending = round?.calls.find((c) => c.result === null)
      return pending ? toolVerb(pending) + '…' : 'thinking…'
    }
    case 'text':
      return 'writing…'
    case 'cost':
      // After an orient outcome the closing cost is settlement, not thought.
      return turn.brief || turn.question ? 'finishing…' : 'thinking…'
    case 'handoff':
    case 'keepalive':
      return previous
    default:
      return previous
  }
}

/** The badge a stopped turn wears (item 7); null when it ended on its own terms. */
export function stopBadge(stop: ExplorerStop | null): { text: string; tone: 'limit' | 'budget' | 'error' } | null {
  switch (stop) {
    case 'step_cap':
      return { text: 'stopped at the round limit — ask a follow-up to keep going', tone: 'limit' }
    case 'cap_cents':
      return { text: 'this conversation’s budget is spent — start a new one', tone: 'budget' }
    case 'error':
      return { text: 'the turn ended in an error', tone: 'error' }
    default:
      return null
  }
}

/** `10.3¢ · 4 model calls · 32 s` (item 6). */
export function costLine(turn: Turn, now: number): string {
  const c = lastCost(turn)
  const parts = [cents(c ? c.turn_cents : 0), plural(turn.calls, 'model call'), seconds(elapsedMs(turn, now))]
  return parts.join(' · ')
}

/** The phase pill: `orient`, `orient · asked`, `orient · brief`, `research`. */
export function phasePill(turn: Turn): string {
  if (turn.phase === 'research') return 'research'
  if (turn.question) return 'orient · asked'
  if (turn.brief) return 'orient · brief'
  return 'orient'
}
