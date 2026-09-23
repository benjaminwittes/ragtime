import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ExplorerTurnError,
  continueFrom,
  explorerTurn,
  parseExplorerStream,
  runExplorerTurn,
  type ExplorerBrief,
  type ExplorerDoneEvent,
  type ExplorerEvent,
} from '../src/explorer.ts'
import { configureWorkerClient } from '../src/config.ts'

const frame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<ExplorerEvent[]> {
  const out: ExplorerEvent[] = []
  for await (const ev of parseExplorerStream(stream)) out.push(ev)
  return out
}

const brief: ExplorerBrief = { goal: 'List the opinions', corpora: ['olc'], answer_shape: 'a list' }

// An orient turn as the worker emitted one on 2026-09-08: two free rounds,
// then propose_brief. Rules 1–3 hold in this fixture by construction.
const orientTurn =
  frame('phase', { phase: 'orient' }) +
  frame('text', { delta: 'I will search ' }) +
  frame('text', { delta: 'the OLC corpus.' }) +
  frame('tool_call', { step: 1, id: 'toolu_1', name: 'search_keyword', input: { query: 'removal', corpora: ['olc'] } }) +
  frame('tool_result', {
    step: 1, id: 'toolu_1', name: 'search_keyword', ok: true, summary: 'olc 104', count: 5, cost_cents: 0, ms: 745,
    detail: { kind: 'search', total: 104, hits: [{ corpus: 'olc', count: 104, top: [{ id: '112', title: 'Emergency Statutes' }] }, { corpus: 'usc', count: 0, top: [] }] },
  }) +
  frame('handoff', { kind: 'workspace', url: '/corpus/olc?q=removal', label: 'Open olc search: removal' }) +
  frame('cost', { turn_cents: 0.2564, conversation_cents: 1, conversation_spend: 0.2564, cap_cents: 25, steps: 1, step_cap: 2 }) +
  frame('tool_call', { step: 3, id: 'toolu_2', name: 'propose_brief', input: brief }) +
  frame('phase', { phase: 'orient', outcome: 'brief', brief }) +
  frame('cost', { turn_cents: 0.9458, conversation_cents: 1, conversation_spend: 0.9458, cap_cents: 25, steps: 1, step_cap: 2 }) +
  frame('done', {
    envelope: 'eyJ2IjoxfQ.abc',
    stop: 'end_turn',
    history: [
      { role: 'assistant', content: [{ type: 'text', text: 'I will search the OLC corpus.' }, { type: 'tool_use', id: 'toolu_2', name: 'propose_brief', input: brief }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'Delivered to the user.' }] },
    ],
    calls: 3,
  })

test('parses a turn in order, each event typed by its name', async () => {
  const events = await collect(streamOf([orientTurn]))
  assert.deepEqual(
    events.map((e) => e.type),
    ['phase', 'text', 'text', 'tool_call', 'tool_result', 'handoff', 'cost', 'tool_call', 'phase', 'cost', 'done'],
  )
  const first = events[0]
  assert.equal(first?.type, 'phase')
  const result = events[4]
  assert.equal(result?.type, 'tool_result')
  if (result?.type === 'tool_result') {
    assert.equal(result.summary, 'olc 104')
    assert.equal(result.count, 5)
    assert.equal(result.ok, true)
    assert.equal(result.detail?.kind, 'search')
    if (result.detail?.kind === 'search') {
      assert.equal(result.detail.total, 104)
      assert.deepEqual(result.detail.hits.map((h) => h.corpus), ['olc', 'usc'])
      assert.equal(result.detail.hits[0]?.top[0]?.title, 'Emergency Statutes')
    }
  }
  const last = events[events.length - 1]
  assert.equal(last?.type, 'done')
  if (last?.type === 'done') {
    assert.equal(last.stop, 'end_turn')
    assert.equal(last.calls, 3)
    assert.equal(last.history.length, 2)
  }
})

test('a tool_result from a worker without detail still types; a failed one carries none', async () => {
  const raw =
    frame('phase', { phase: 'research' }) +
    frame('tool_result', { step: 1, id: 'toolu_old', name: 'get_facets', ok: true, summary: '7 matching', cost_cents: 0, ms: 12 }) +
    frame('tool_result', { step: 1, id: 'toolu_bad', name: 'get_facets', ok: false, summary: 'Tool failed: db down', cost_cents: 0, ms: 3 }) +
    frame('done', { envelope: 'e.m', stop: 'end_turn', history: [], calls: 1 })
  const events = await collect(streamOf([raw]))
  const results = events.filter((e) => e.type === 'tool_result')
  assert.equal(results.length, 2)
  for (const r of results) if (r.type === 'tool_result') assert.equal(r.detail, undefined)
})

test('frames split across chunk boundaries reassemble', async () => {
  const chunks: string[] = []
  for (let i = 0; i < orientTurn.length; i += 7) chunks.push(orientTurn.slice(i, i + 7))
  const whole = await collect(streamOf([orientTurn]))
  const pieces = await collect(streamOf(chunks))
  assert.deepEqual(pieces, whole)
})

test('a trailing frame without its blank line still parses', async () => {
  const raw = frame('phase', { phase: 'research' }) + 'event: done\ndata: {"envelope":null,"stop":"error","history":[],"calls":0}'
  const events = await collect(streamOf([raw]))
  assert.deepEqual(events.map((e) => e.type), ['phase', 'done'])
})

test('keepalives are yielded; unknown event names and non-JSON data are skipped', async () => {
  const raw =
    frame('phase', { phase: 'orient' }) +
    frame('keepalive', {}) +
    frame('metrics', { anything: 1 }) +
    'event: text\ndata: not json\n\n' +
    ': a comment line\n\n' +
    frame('done', { envelope: 'e.m', stop: 'end_turn', history: [], calls: 1 })
  const events = await collect(streamOf([raw]))
  assert.deepEqual(events.map((e) => e.type), ['phase', 'keepalive', 'done'])
})

test('CRLF line endings parse the same', async () => {
  const raw = orientTurn.replace(/\n/g, '\r\n')
  const events = await collect(streamOf([raw]))
  assert.equal(events.length, 11)
  assert.equal(events[events.length - 1]?.type, 'done')
})

test('explorerTurn posts the credential and the phase, never a model, and omits an absent envelope', async () => {
  configureWorkerClient({ baseUrl: 'http://worker.test/' })
  let seen: { url: string; init: RequestInit } | null = null
  const fetchFake: typeof globalThis.fetch = async (input, init) => {
    seen = { url: String(input), init: init ?? {} }
    return new Response(orientTurn, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const events: ExplorerEvent[] = []
  for await (const ev of explorerTurn(
    { phase: 'orient', messages: [{ role: 'user', content: 'hello' }] },
    { mode: 'demo', model: 'claude-haiku-4-5', password: 'pw' },
    { fetch: fetchFake },
  )) events.push(ev)
  assert.ok(seen)
  const call = seen as unknown as { url: string; init: RequestInit }
  assert.equal(call.url, 'http://worker.test/explorer/turn')
  assert.equal(call.init.method, 'POST')
  const body = JSON.parse(String(call.init.body)) as Record<string, unknown>
  assert.equal(body.phase, 'orient')
  assert.equal(body.password, 'pw')
  assert.equal(body.provider, 'anthropic')
  assert.equal('model' in body, false)
  assert.equal('envelope' in body, false)
  assert.equal('brief' in body, false)
  assert.equal(events.length, 11)
})

test('a research turn carries the brief and the envelope; paid auth goes in the header', async () => {
  let seen: { init: RequestInit } | null = null
  const fetchFake: typeof globalThis.fetch = async (_input, init) => {
    seen = { init: init ?? {} }
    return new Response(frame('phase', { phase: 'research' }) + frame('done', { envelope: 'e.m', stop: 'end_turn', history: [], calls: 1 }), { status: 200 })
  }
  const r = await runExplorerTurn(
    { phase: 'research', messages: [{ role: 'user', content: 'go' }], envelope: 'prev.sig', brief },
    { mode: 'paid', model: 'claude-sonnet-5', sessionToken: 'jwt' },
    undefined,
    { fetch: fetchFake },
  )
  const call = seen as unknown as { init: RequestInit }
  const headers = call.init.headers as Record<string, string>
  assert.equal(headers['Authorization'], 'Bearer jwt')
  const body = JSON.parse(String(call.init.body)) as Record<string, unknown>
  assert.equal(body.envelope, 'prev.sig')
  assert.deepEqual(body.brief, brief)
  assert.equal(r.done?.envelope, 'e.m')
})

test('a JSON refusal before the stream opens throws ExplorerTurnError with the code', async () => {
  const fetchFake: typeof globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'This conversation has reached its spend cap (25 cents). Start a new one.', code: 'cap_cents' } }), { status: 402 })
  await assert.rejects(
    async () => {
      for await (const _ of explorerTurn({ phase: 'orient', messages: [{ role: 'user', content: 'x' }] }, { mode: 'demo', model: '', password: 'pw' }, { fetch: fetchFake })) void _
    },
    (err: unknown) => err instanceof ExplorerTurnError && err.status === 402 && err.code === 'cap_cents' && /spend cap/.test(err.message),
  )
})

test('runExplorerTurn collects text, the outcome, the last cost and done; continueFrom appends history', async () => {
  const fetchFake: typeof globalThis.fetch = async () => new Response(orientTurn, { status: 200 })
  const seen: string[] = []
  const messages = [{ role: 'user' as const, content: 'hello' }]
  const r = await runExplorerTurn({ phase: 'orient', messages }, { mode: 'demo', model: '', password: 'pw' }, (ev) => seen.push(ev.type), { fetch: fetchFake })
  assert.equal(seen.length, 11)
  assert.equal(r.text, 'I will search the OLC corpus.')
  assert.equal(r.outcome?.outcome, 'brief')
  assert.deepEqual(r.outcome?.brief, brief)
  assert.equal(r.cost?.conversation_spend, 0.9458)
  assert.equal(r.error, null)
  assert.ok(r.done)
  const next = continueFrom(messages, r.done as ExplorerDoneEvent)
  assert.equal(next.messages.length, 3)
  assert.equal(next.messages[0], messages[0])
  assert.equal(next.envelope, 'eyJ2IjoxfQ.abc')
})
