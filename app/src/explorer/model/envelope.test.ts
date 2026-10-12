import { test } from 'vitest'
import assert from 'node:assert/strict'

import { ExplorerTurnError, type ExplorerEvent, type ExplorerTurnRequest } from '@lawfare/ragtime-client'
import { openTurn } from './envelope.ts'

// What the worker says when the envelope a browser kept does not verify any more: it was
// signed more than a day ago, or under a secret that has since rotated. Both look the
// same from here, and both are what an old tab or a restored conversation sends.
const STALE = new ExplorerTurnError(400, 'Bad or expired envelope', 'bad_envelope')

const done: ExplorerEvent = { type: 'done', envelope: 'fresh.sig', stop: 'end_turn', history: [], calls: 1 }
const stream: ExplorerEvent[] = [{ type: 'phase', phase: 'orient' }, { type: 'text', delta: 'Hello.' }, done]

/** A worker that refuses every envelope it is handed and answers a bare request. */
function staleWorker() {
  const seen: (string | null)[] = []
  const open = (req: ExplorerTurnRequest) => {
    seen.push(req.envelope)
    return (async function* () {
      if (req.envelope) throw STALE
      yield* stream
    })()
  }
  return { open, seen }
}

/** An opening the worker refuses before any event, as it does with a JSON 4xx. */
function refused(err: ExplorerTurnError): AsyncIterable<ExplorerEvent> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(err) }) }
}

async function collect(it: AsyncIterable<ExplorerEvent>): Promise<ExplorerEvent[]> {
  const out: ExplorerEvent[] = []
  for await (const ev of it) out.push(ev)
  return out
}

test('a day-old conversation: the stale envelope is refused, the turn is reopened without one, and the reader gets the answer', async () => {
  const w = staleWorker()
  const req: ExplorerTurnRequest = { phase: 'orient', messages: [{ role: 'user', content: 'pardons?' }], envelope: 'stale.sig' }
  let dropped = 0
  const events = await collect(openTurn(w.open, req, { onEnvelopeDropped: () => dropped++ }))
  assert.deepEqual(w.seen, ['stale.sig', null], 'opened once with the kept envelope, once without')
  assert.deepEqual(events, stream, 'the second opening is the turn the reader sees, whole')
  assert.equal(dropped, 1, 'the caller is told so it forgets the stale envelope too')
})

test('a fresh conversation has no envelope to drop: a refusal is the refusal', async () => {
  const seen: (string | null)[] = []
  const open = (req: ExplorerTurnRequest) => {
    seen.push(req.envelope)
    return refused(new ExplorerTurnError(429, 'quota', 'ip_quota'))
  }
  const req: ExplorerTurnRequest = { phase: 'orient', messages: [{ role: 'user', content: 'x' }], envelope: null }
  await assert.rejects(collect(openTurn(open, req)), (e: unknown) => e instanceof ExplorerTurnError && e.code === 'ip_quota')
  assert.deepEqual(seen, [null], 'no second opening')
})

test('an envelope refused for another reason is not retried: only bad_envelope means "forget it and go on"', async () => {
  const seen: (string | null)[] = []
  const open = (req: ExplorerTurnRequest) => {
    seen.push(req.envelope)
    return refused(new ExplorerTurnError(402, 'cap', 'cap_cents'))
  }
  const req: ExplorerTurnRequest = { phase: 'research', messages: [], envelope: 'kept.sig', brief: { goal: 'g', corpora: ['olc'], answer_shape: 'a' } }
  await assert.rejects(collect(openTurn(open, req)), (e: unknown) => e instanceof ExplorerTurnError && e.code === 'cap_cents')
  assert.deepEqual(seen, ['kept.sig'])
})

test('the retry carries everything else the turn had: phase, messages and the accepted brief', async () => {
  const reqs: ExplorerTurnRequest[] = []
  const open = (req: ExplorerTurnRequest) => {
    reqs.push(req)
    return (async function* () {
      if (req.envelope) throw STALE
      yield done
    })()
  }
  const brief = { goal: 'List OLC opinions on pardons', corpora: ['olc'], answer_shape: 'a list' }
  const req: ExplorerTurnRequest = { phase: 'research', messages: [{ role: 'user', content: 'go' }], envelope: 'stale.sig', brief }
  await collect(openTurn(open, req))
  assert.equal(reqs.length, 2)
  assert.deepEqual(reqs[1], { ...req, envelope: null })
})

test('a stale envelope refused twice is an error, not a loop', async () => {
  let n = 0
  const open = () => {
    n++
    return refused(STALE)
  }
  const req: ExplorerTurnRequest = { phase: 'orient', messages: [], envelope: 'stale.sig' }
  await assert.rejects(collect(openTurn(open, req)), (e: unknown) => e instanceof ExplorerTurnError && e.code === 'bad_envelope')
  assert.equal(n, 2)
})
