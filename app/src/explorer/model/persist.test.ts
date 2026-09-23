import assert from 'node:assert/strict'
import { test } from 'vitest'

import { BUDGET_BYTES, PERSIST_VERSION, pack, restore, settle, type Saved } from './persist.ts'
import { newTurn, type Turn } from './turn.ts'

function turn(patch: Partial<Turn> = {}): Turn {
  return { ...newTurn(1, 'orient', 'what happened', 'ask', 1000), ...patch }
}

function saved(patch: Partial<Saved> = {}): Saved {
  return {
    v: PERSIST_VERSION,
    turns: [turn({ running: false, endedAt: 2000, answer: 'an answer' })],
    brief: null,
    proposed: null,
    pinned: [],
    messages: [{ role: 'user', content: 'what happened' }],
    envelope: null,
    savedAt: 2000,
    ...patch,
  }
}

test('a turn that was running when the page closed comes back interrupted, never running', () => {
  const t = settle(turn({ running: true, buffer: 'half a sen', lastEvent: { type: 'text', text: 'x' } as Turn['lastEvent'] }), 9000)
  assert.equal(t.running, false)
  assert.equal(t.endedAt, 9000)
  assert.equal(t.error?.code, 'interrupted')
  // A spinner over a request nobody is making, and text that will never be flushed.
  assert.equal(t.buffer, '')
  assert.equal(t.lastEvent, null)
})

test('settling a finished turn changes nothing, including its error', () => {
  const done = turn({ running: false, endedAt: 2000, stop: 'end_turn' })
  assert.deepEqual(settle(done, 9000), done)
  // An error already explained is not overwritten with the generic one.
  const failed = turn({ running: true, error: { type: 'error', code: 'cap_cents', message: 'the cap', retryable: false } })
  assert.equal(settle(failed, 9000).error?.code, 'cap_cents')
})

test('a round trip returns what went in', () => {
  const s = saved({ pinned: ['olc', 'usc'], envelope: 'abc123', brief: { goal: 'g', corpora: ['olc'], answer_shape: 'a list' } })
  const back = restore(pack(s), 9000)
  assert.deepEqual(back?.pinned, ['olc', 'usc'])
  assert.equal(back?.envelope, 'abc123')
  assert.equal(back?.brief?.goal, 'g')
  assert.equal(back?.turns.length, 1)
  assert.deepEqual(back?.messages, s.messages)
})

test('a blob from an older shape is dropped rather than half-read', () => {
  assert.equal(restore(JSON.stringify({ ...saved(), v: 0 }), 9000), null)
})

test('nothing a reader could arrive with throws', () => {
  assert.equal(restore(null, 9000), null)
  assert.equal(restore('', 9000), null)
  assert.equal(restore('not json at all', 9000), null)
  assert.equal(restore('null', 9000), null)
  assert.equal(restore('"a string"', 9000), null)
  assert.equal(restore('42', 9000), null)
  // Our version, but not our shape.
  assert.equal(restore(JSON.stringify({ v: PERSIST_VERSION }), 9000), null)
  assert.equal(restore(JSON.stringify({ v: PERSIST_VERSION, turns: [], messages: 'no', pinned: [] }), 9000), null)
})

test('over budget the oldest turns go and the continuation is kept whole', () => {
  // Turns big enough that several cannot fit, and a message history that must survive.
  const fat = (i: number) => turn({ index: i, answer: 'x'.repeat(300_000), running: false, endedAt: 2000 })
  const s = saved({ turns: [fat(1), fat(2), fat(3), fat(4)], messages: [{ role: 'user', content: 'keep me' }] })
  const raw = pack(s)
  assert.notEqual(raw, null)
  assert.ok(raw!.length <= BUDGET_BYTES)
  const back = restore(raw, 9000)
  // The newest survive; the model still remembers all of it.
  assert.equal(back?.turns.at(-1)?.index, 4)
  assert.ok((back?.turns.length ?? 0) < 4)
  assert.deepEqual(back?.messages, [{ role: 'user', content: 'keep me' }])
})

test('one turn too large to store writes nothing rather than something false', () => {
  const huge = turn({ answer: 'x'.repeat(BUDGET_BYTES + 1), running: false, endedAt: 2000 })
  assert.equal(pack(saved({ turns: [huge] })), null)
})
