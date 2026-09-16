import { test } from 'vitest'
import assert from 'node:assert/strict'

import type { ExplorerBrief, ExplorerEvent, ExplorerToolResultEvent } from '@lawfare/ragtime-client'
import { acceptMarker, applyEvent, lastCost, newTurn, roundCosts, type Turn } from './turn.ts'
import { knownTitles, sourcesOf, workspaceHandoffs } from './sources.ts'
import { costLine, phasePill, stopBadge, workingLabel } from './format.ts'

const brief: ExplorerBrief = { goal: 'List the OLC opinions on emergency powers', corpora: ['olc'], answer_shape: 'a list' }

function fold(turn: Turn, events: ExplorerEvent[], t0 = 1000): Turn {
  let t = turn
  let now = t0
  for (const ev of events) {
    now += 100
    t = applyEvent(t, ev, now)
  }
  return t
}

// An orient turn as the worker emitted one: narration, a free round, then propose_brief.
const orientEvents: ExplorerEvent[] = [
  { type: 'phase', phase: 'orient' },
  { type: 'text', delta: 'I will look at ' },
  { type: 'text', delta: 'the OLC corpus first.' },
  { type: 'tool_call', step: 1, id: 't1', name: 'search_keyword', input: { query: 'emergency powers', corpora: ['olc'] } },
  { type: 'tool_result', step: 1, id: 't1', name: 'search_keyword', ok: true, summary: 'olc 104', count: 104, cost_cents: 0, ms: 745,
    detail: { kind: 'search', total: 104, hits: [{ corpus: 'olc', count: 104, top: [{ id: '112', title: 'Emergency Statutes' }] }] } },
  { type: 'handoff', kind: 'workspace', url: '/corpus/olc?q=emergency%20powers', label: 'Open olc search: emergency powers' },
  { type: 'cost', turn_cents: 0.25, conversation_cents: 1, conversation_spend: 0.25, cap_cents: 25, steps: 1, step_cap: 2 },
  { type: 'text', delta: 'Two corpora fit, so here is a brief.' },
  { type: 'tool_call', step: 3, id: 't2', name: 'propose_brief', input: brief as unknown as Record<string, unknown> },
  { type: 'phase', phase: 'orient', outcome: 'brief', brief },
  { type: 'cost', turn_cents: 0.9, conversation_cents: 1, conversation_spend: 0.9, cap_cents: 25, steps: 1, step_cap: 2 },
  { type: 'done', envelope: 'e.m', stop: 'end_turn', history: [], calls: 3 },
]

test('an orient turn: narration stays as faint segments, the brief is the outcome, nothing is an answer', () => {
  const t = fold(newTurn(1, 'orient', 'emergency powers?', 'ask', 1000), orientEvents)
  assert.deepEqual(t.narration, ['I will look at the OLC corpus first.', 'Two corpora fit, so here is a brief.'])
  assert.equal(t.answer, '')
  assert.deepEqual(t.brief, brief)
  assert.equal(t.question, null)
  assert.equal(t.running, false)
  assert.equal(t.stop, 'end_turn')
  assert.equal(t.calls, 3)
  assert.equal(t.rounds.length, 2)
  assert.equal(t.rounds[0]?.calls[0]?.result?.summary, 'olc 104')
  assert.equal(t.rounds[1]?.calls[0]?.name, 'propose_brief')
  assert.equal(phasePill(t), 'orient · brief')
  assert.equal(lastCost(t)?.turn_cents, 0.9)
  assert.equal(workspaceHandoffs(t).length, 1)
  assert.equal(costLine(t, 9999), '0.9¢ · 3 model calls · 1 s')
})

test('a clarifying question is the outcome and the pill says so', () => {
  const t = fold(newTurn(1, 'orient', 'pardons', 'ask', 0), [
    { type: 'phase', phase: 'orient' },
    { type: 'tool_call', step: 1, id: 'q', name: 'ask_user', input: { question: 'Which president?' } },
    { type: 'phase', phase: 'orient', outcome: 'question', question: 'Which president?' },
    { type: 'cost', turn_cents: 0.1, conversation_cents: 1, conversation_spend: 0.1, cap_cents: 25, steps: 0, step_cap: 2 },
    { type: 'done', envelope: 'e.m', stop: 'question', history: [], calls: 1 },
  ])
  assert.equal(t.question, 'Which president?')
  assert.equal(phasePill(t), 'orient · asked')
  assert.equal(stopBadge(t.stop), null)
})

// A research turn: two parallel searches in round 1 (two cost events with the
// same turn_cents), a full fetch in round 2, then the cited answer.
const researchEvents: ExplorerEvent[] = [
  { type: 'phase', phase: 'research' },
  { type: 'text', delta: 'Searching both ways first.' },
  { type: 'tool_call', step: 1, id: 'a', name: 'search_semantic', input: { corpus: 'olc', query: 'emergency communications' } },
  { type: 'tool_call', step: 1, id: 'b', name: 'search_keyword', input: { query: 'communications', corpora: ['olc'] } },
  { type: 'tool_result', step: 1, id: 'a', name: 'search_semantic', ok: true, summary: 'olc 12', cost_cents: 0, ms: 900,
    detail: { kind: 'search', total: 12, hits: [{ corpus: 'olc', count: 12, top: [{ id: '867', title: 'Legal Authorities' }] }] } },
  { type: 'cost', turn_cents: 1.2, conversation_cents: 3, conversation_spend: 2.1, cap_cents: 25, steps: 1, step_cap: 6 },
  { type: 'tool_result', step: 1, id: 'b', name: 'search_keyword', ok: true, summary: 'olc 30', cost_cents: 0, ms: 700,
    detail: { kind: 'search', total: 30, hits: [{ corpus: 'olc', count: 30, top: [] }] } },
  { type: 'handoff', kind: 'workspace', url: '/corpus/olc?q=communications', label: 'Open olc search: communications' },
  { type: 'cost', turn_cents: 1.2, conversation_cents: 3, conversation_spend: 2.1, cap_cents: 25, steps: 1, step_cap: 6 },
  { type: 'text', delta: 'Now reading the two that matter.' },
  { type: 'tool_call', step: 2, id: 'c', name: 'fetch_documents', input: { corpus: 'olc', ids: ['867', '112'], mode: 'full' } },
  { type: 'tool_result', step: 2, id: 'c', name: 'fetch_documents', ok: true, summary: 'Legal Authorities; Emergency Statutes', cost_cents: 0, ms: 1500,
    detail: { kind: 'documents', corpus: 'olc', mode: 'full', count: 2, documents: [{ id: '867', title: 'Legal Authorities', chars: 5000 }, { id: '112', title: 'Emergency Statutes', chars: 3000 }] } },
  { type: 'cost', turn_cents: 3.0, conversation_cents: 4, conversation_spend: 3.9, cap_cents: 25, steps: 2, step_cap: 6 },
  { type: 'text', delta: 'Two opinions speak to it: [Legal Authorities](rt://olc/867) and [Emergency Statutes](rt://olc/112); ' },
  { type: 'text', delta: 'a third, [Section 706](rt://olc/50), came up in search only.' },
  { type: 'handoff', kind: 'document', url: '/corpus/olc/867', label: 'Legal Authorities' },
  { type: 'handoff', kind: 'document', url: '/corpus/olc/112', label: 'Emergency Statutes' },
  { type: 'handoff', kind: 'document', url: '/corpus/olc/50', label: 'Section 706' },
  { type: 'cost', turn_cents: 5.5, conversation_cents: 7, conversation_spend: 6.4, cap_cents: 25, steps: 2, step_cap: 6 },
  { type: 'done', envelope: 'e.m', stop: 'end_turn', history: [], calls: 3 },
]

test('a research turn: narration before each round, the closing text is the answer, rounds coalesce their costs', () => {
  const r = fold(newTurn(2, 'research', 'Proceed with the brief.', 'accept', 0), researchEvents)
  assert.deepEqual(r.narration, ['Searching both ways first.', 'Now reading the two that matter.'])
  assert.match(r.answer, /^Two opinions speak to it/)
  assert.equal(r.rounds.length, 2)
  assert.equal(r.rounds[0]?.calls.length, 2)
  assert.equal(r.costs.length, 4)
  const costs = roundCosts(r)
  assert.equal(costs.get(1), 1.2)
  assert.equal(costs.get(2), 1.8)
  assert.equal(lastCost(r)?.turn_cents, 5.5)
  assert.equal(workspaceHandoffs(r).length, 1)
})

test('sources: cited documents read in full are marked apart from those only seen; an uncited full read is listed', () => {
  const r = fold(newTurn(2, 'research', 'go', 'accept', 0), researchEvents)
  const s = sourcesOf(r)
  assert.deepEqual(s.sources.map((x) => [x.id, x.read]), [['867', true], ['112', true], ['50', false]])
  assert.equal(s.readCount, 2)
  assert.equal(s.searchOnly, false)
  assert.equal(s.sources[0]?.path, '/corpus/olc/867')
  assert.deepEqual(s.readUncited, [])
})

test('sources: a turn that fetched nothing is search-only, unless an earlier turn read the document', () => {
  const searchOnlyEvents = researchEvents.filter((e) => !('step' in e && e.step === 2) && !(e.type === 'text' && e.delta.startsWith('Now')))
  const r = fold(newTurn(2, 'research', 'go', 'accept', 0), searchOnlyEvents)
  const s = sourcesOf(r)
  assert.equal(s.searchOnly, true)
  assert.equal(s.readCount, 0)
  const earlier = fold(newTurn(1, 'research', 'go', 'accept', 0), researchEvents)
  const later = sourcesOf(r, [earlier])
  assert.equal(later.searchOnly, false)
  assert.deepEqual(later.sources.map((x) => x.read), [true, true, false])
})

test('sources: a citation that is its own link text is titled from the answer, else from the trail, else slug/id', () => {
  const events: ExplorerEvent[] = [
    { type: 'phase', phase: 'research' },
    { type: 'tool_call', step: 1, id: 'a', name: 'search_keyword', input: { query: 'wireless', corpora: ['olc'] } },
    { type: 'tool_result', step: 1, id: 'a', name: 'search_keyword', ok: true, summary: 'olc 2', cost_cents: 0, ms: 5,
      detail: { kind: 'search', total: 2, hits: [{ corpus: 'olc', count: 2, top: [{ id: '2100', title: 'Executive Powers Available' }, { id: 9, title: 'Nine' }] }] } },
    { type: 'cost', turn_cents: 1, conversation_cents: 1, conversation_spend: 1, cap_cents: 25, steps: 1, step_cap: 6 },
    { type: 'text', delta: '1. **Presidential Control of Wireless** — 1941 — [rt://olc/1425](rt://olc/1425).\n2. See [rt://olc/2100](rt://olc/2100).\n3. And [rt://olc/7](rt://olc/7).\n4. Also [Section 706](rt://olc/50).' },
    { type: 'handoff', kind: 'document', url: '/corpus/olc/1425', label: 'rt://olc/1425' },
    { type: 'handoff', kind: 'document', url: '/corpus/olc/2100', label: 'rt://olc/2100' },
    { type: 'handoff', kind: 'document', url: '/corpus/olc/7', label: 'rt://olc/7' },
    { type: 'handoff', kind: 'document', url: '/corpus/olc/50', label: 'Section 706' },
    { type: 'cost', turn_cents: 2, conversation_cents: 2, conversation_spend: 2, cap_cents: 25, steps: 1, step_cap: 6 },
    { type: 'done', envelope: 'e.m', stop: 'end_turn', history: [], calls: 2 },
  ]
  const r = fold(newTurn(2, 'research', 'go', 'accept', 0), events)
  const s = sourcesOf(r)
  assert.deepEqual(
    s.sources.map((x) => x.title),
    ['Presidential Control of Wireless', 'Executive Powers Available', 'olc/7', 'Section 706'],
  )
  assert.equal(s.searchOnly, true)
  const known = knownTitles(r)
  assert.equal(known.get('/corpus/olc/9'), 'Nine')
  assert.equal(known.get('/corpus/olc/1425'), 'Presidential Control of Wireless')
  assert.equal(known.get('/corpus/olc/50'), 'Section 706')
})

test('sources: a detail whose list is missing costs a title, not the page', () => {
  // The worker is allowed to be ahead of this build — the stream parser skips event names
  // it does not know for exactly that reason — so a detail with a kind we read and a list
  // we do not get is reachable. `knownTitles` runs while the answer renders, so throwing
  // here white-screened a reader who never opened the trail.
  const events: ExplorerEvent[] = [
    { type: 'phase', phase: 'research' },
    { type: 'tool_call', step: 1, id: 'a', name: 'search_keyword', input: { query: 'wireless', corpora: ['olc'] } },
    { type: 'tool_result', step: 1, id: 'a', name: 'search_keyword', ok: true, summary: 'olc 2', cost_cents: 0, ms: 5,
      detail: { kind: 'search' } as unknown as ExplorerToolResultEvent['detail'] },
    { type: 'tool_call', step: 2, id: 'b', name: 'fetch_documents', input: { corpus: 'olc', mode: 'full', ids: ['1425'] } },
    { type: 'tool_result', step: 2, id: 'b', name: 'fetch_documents', ok: true, summary: 'read 1', cost_cents: 0, ms: 5,
      detail: { kind: 'documents', mode: 'full', corpus: 'olc', count: 1 } as unknown as ExplorerToolResultEvent['detail'] },
    { type: 'text', delta: 'See [rt://olc/1425](rt://olc/1425).' },
    { type: 'done', envelope: 'e.m', stop: 'end_turn', history: [], calls: 1 },
  ]
  const r = fold(newTurn(2, 'research', 'go', 'accept', 0), events)
  // No title is known, because none was sent — and that is the whole cost.
  assert.equal(knownTitles(r).size, 0)
  assert.deepEqual(sourcesOf(r).sources.map((x) => x.title), ['olc/1425'])
})

test('sources: a bracketed or naked citation the worker made no handoff for is still a source, titled from the trail else slug/id', () => {
  const events: ExplorerEvent[] = [
    { type: 'phase', phase: 'research' },
    { type: 'tool_call', step: 1, id: 'a', name: 'search_keyword', input: { query: 'third country removal', corpora: ['litigation'] } },
    { type: 'tool_result', step: 1, id: 'a', name: 'search_keyword', ok: true, summary: 'litigation 40', cost_cents: 0, ms: 5,
      detail: { kind: 'search', total: 40, hits: [{ corpus: 'litigation', count: 40, top: [{ id: 71906132, title: 'Ruiz v. ICE' }] }] } },
    { type: 'cost', turn_cents: 1, conversation_cents: 1, conversation_spend: 1, cap_cents: 25, steps: 1, step_cap: 6 },
    { type: 'text', delta: 'Ruiz v. ICE [rt://litigation/71906132] and SPLC [rt://litigation/73223865, 73223872]; see rt://olc/112. Also [Section 706](rt://olc/50).' },
    { type: 'handoff', kind: 'document', url: '/corpus/olc/50', label: 'Section 706' },
    { type: 'cost', turn_cents: 2, conversation_cents: 2, conversation_spend: 2, cap_cents: 25, steps: 1, step_cap: 6 },
    { type: 'done', envelope: 'e.m', stop: 'end_turn', history: [], calls: 2 },
  ]
  const r = fold(newTurn(2, 'research', 'go', 'accept', 0), events)
  const s = sourcesOf(r)
  assert.deepEqual(
    s.sources.map((x) => [x.title, x.path, x.read]),
    [
      ['Section 706', '/corpus/olc/50', false],
      ['Ruiz v. ICE', '/corpus/litigation/71906132', false],
      ['litigation/73223865', '/corpus/litigation/73223865', false],
      ['litigation/73223872', '/corpus/litigation/73223872', false],
      ['olc/112', '/corpus/olc/112', false],
    ],
  )
  assert.equal(s.searchOnly, true)
})

test('the working label follows the last event; keepalives keep the previous label', () => {
  let t = newTurn(1, 'research', 'go', 'accept', 0)
  assert.equal(workingLabel(t, ''), 'researching…')
  t = applyEvent(t, { type: 'tool_call', step: 1, id: 'c', name: 'fetch_documents', input: { corpus: 'olc', ids: [1, 2, 3], mode: 'full' } }, 1)
  assert.equal(workingLabel(t, ''), 'reading 3 documents…')
  t = applyEvent(t, { type: 'tool_call', step: 1, id: 'd', name: 'search_semantic', input: { corpus: 'usc', query: 'x' } }, 2)
  t = applyEvent(t, { type: 'tool_result', step: 1, id: 'c', name: 'fetch_documents', ok: true, summary: '3 documents', cost_cents: 0, ms: 5 }, 3)
  assert.equal(workingLabel(t, ''), 'searching usc for “x”…')
  t = applyEvent(t, { type: 'tool_result', step: 1, id: 'd', name: 'search_semantic', ok: true, summary: 'usc 2', cost_cents: 0, ms: 5 }, 4)
  assert.equal(workingLabel(t, ''), 'thinking…')
  t = applyEvent(t, { type: 'keepalive' }, 5)
  assert.equal(workingLabel(t, 'thinking…'), 'thinking…')
  t = applyEvent(t, { type: 'text', delta: 'A' }, 6)
  assert.equal(workingLabel(t, ''), 'writing…')
  // An orient turn ending: the terminal tool names itself, and the closing cost is settlement.
  let o = newTurn(1, 'orient', 'q', 'ask', 0)
  o = applyEvent(o, { type: 'tool_call', step: 3, id: 'b', name: 'propose_brief', input: {} }, 1)
  assert.equal(workingLabel(o, ''), 'writing the brief…')
  o = applyEvent(o, { type: 'phase', phase: 'orient', outcome: 'brief', brief: { goal: 'g', corpora: ['olc'], answer_shape: 'a list' } }, 2)
  o = applyEvent(o, { type: 'cost', turn_cents: 1, conversation_cents: 1, conversation_spend: 1, cap_cents: 25, steps: 1, step_cap: 2 }, 3)
  assert.equal(workingLabel(o, ''), 'finishing…')
})

test('the stop badge names the cap that ended the turn', () => {
  assert.equal(stopBadge('end_turn'), null)
  assert.match(stopBadge('step_cap')!.text, /round limit/)
  assert.match(stopBadge('cap_cents')!.text, /budget is spent/)
  const t = fold(newTurn(1, 'research', 'go', 'accept', 0), [
    { type: 'phase', phase: 'research' },
    { type: 'text', delta: 'Answer from what I have.' },
    { type: 'done', envelope: null, stop: 'step_cap', history: [], calls: 7 },
  ])
  assert.equal(t.answer, 'Answer from what I have.')
  assert.equal(stopBadge(t.stop)?.tone, 'limit')
})

test('the accept marker names the edit from the second acceptance, and claims continuity only once there is an answer above', () => {
  const orient = fold(newTurn(1, 'orient', 'emergency powers?', 'ask', 1000), orientEvents)
  const first = fold(newTurn(2, 'research', '', 'accept', 3000), researchEvents, 3000)
  assert.equal(acceptMarker([orient, first], 1), 'research started with the brief')

  // The second acceptance can only follow an edit, so it says so — and with an answer
  // already on the page it also says that answer did not go away.
  const second = newTurn(3, 'research', '', 'accept', 6000)
  assert.ok(first.answer)
  assert.equal(
    acceptMarker([orient, first, second], 2),
    'research restarted with the edited brief. The answers above are still in the conversation.',
  )

  // A restart after a turn that produced no answer has nothing above to still be there.
  const empty = fold(newTurn(2, 'research', '', 'accept', 3000), [{ type: 'phase', phase: 'research' }])
  assert.equal(empty.answer, '')
  assert.equal(acceptMarker([orient, empty, second], 2), 'research restarted with the edited brief')
})

test('a result whose call was never seen is kept in its round', () => {
  const t = fold(newTurn(1, 'research', 'go', 'accept', 0), [
    { type: 'phase', phase: 'research' },
    { type: 'tool_result', step: 1, id: 'lost', name: 'get_facets', ok: true, summary: '7 filterable fields', cost_cents: 0, ms: 5 },
  ])
  assert.equal(t.rounds[0]?.calls[0]?.id, 'lost')
  assert.equal(t.rounds[0]?.calls[0]?.result?.summary, '7 filterable fields')
})
