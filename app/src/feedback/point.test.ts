import { test } from 'vitest'
import assert from 'node:assert/strict'

import { configureWorkerClient } from '@lawfare/ragtime-client'

import {
  POINT,
  feedbackRequested,
  noteFor,
  outcomeSaid,
  pageAddress,
  reportFor,
  sendNote,
  surfaceFor,
} from './point.ts'

const ENDPOINT = '/feedback/point'

function answering(status: number): typeof globalThis.fetch {
  return (async () => new Response('{}', { status })) as unknown as typeof globalThis.fetch
}

function recording(status: number) {
  const seen: { url?: string; init?: RequestInit } = {}
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.url = url
    seen.init = init
    return new Response('{}', { status })
  }) as unknown as typeof globalThis.fetch
  return { seen, fetchImpl }
}

const plain = { surface: 'ragtime', route: '/', selector: null, quote: null }

test('a note carries the surface, and empty strings where nothing was pointed at', () => {
  assert.deepEqual(noteFor({ ...plain, surface: 'explorer', body: '  the trail is confusing  ' }), {
    surface: 'explorer',
    body: 'the trail is confusing',
    route: '/',
    selector: '',
    quote: '',
    email: '',
  })
})

test('the Explorer keeps the name its capture route already serves; everything else is the site', () => {
  assert.equal(surfaceFor('/explorer'), 'explorer')
  assert.equal(surfaceFor('/'), 'ragtime')
  assert.equal(surfaceFor('/corpus/olc/112'), 'ragtime')
  assert.equal(surfaceFor('/explorers'), 'ragtime')
})

test('the address keeps the search and drops anything that is a credential', () => {
  assert.equal(pageAddress('/corpus/olc', '?q=emergency+powers'), '/corpus/olc?q=emergency+powers')
  assert.equal(pageAddress('/', ''), '/')
  assert.equal(pageAddress('/', '?code=abc123&q=habeas'), '/?q=habeas')
  assert.equal(pageAddress('/', '?token_hash=abc&access_token=def'), '/')
  // How the panel was opened is not where the reader is.
  assert.equal(pageAddress('/explorer', '?feedback=1'), '/explorer')
})

test('a note with no words in it is refused before any request is made', async () => {
  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}', { status: 201 })
  }) as unknown as typeof globalThis.fetch
  const note = noteFor({ ...plain, body: '   ' })
  assert.equal(await sendNote(ENDPOINT, note, 'note', fetchImpl), 'empty')
  assert.equal(await sendNote(ENDPOINT, note, 'report', fetchImpl), 'empty')
  assert.equal(called, false)
})

test('a named capture route gets the note as it is', async () => {
  const { seen, fetchImpl } = recording(201)
  const note = noteFor({ ...plain, body: 'a real note', selector: 'main > p', quote: 'x' })
  assert.equal(await sendNote(ENDPOINT, note, 'note', fetchImpl), 'sent')
  assert.equal(seen.url, ENDPOINT)
  assert.equal(seen.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(seen.init?.body)), note)
})

test('the report route gets the same note in its own three words', async () => {
  const { seen, fetchImpl } = recording(201)
  const note = noteFor({
    surface: 'ragtime',
    body: 'The count says 12 but the list shows 9.\nSecond line.',
    route: '/corpus/olc?q=emergency',
    selector: 'main > p',
    quote: '12 opinions',
    email: ' reader@example.org ',
  })
  assert.equal(await sendNote('/problem-reports', note, 'report', fetchImpl), 'sent')
  assert.deepEqual(JSON.parse(String(seen.init?.body)), {
    summary: 'Site feedback: The count says 12 but the list shows 9.',
    observed: 'The count says 12 but the list shows 9.\nSecond line.',
    expected: 'Not stated (sent from the site feedback form).',
    detail: [
      'Page: /corpus/olc?q=emergency',
      'Surface: ragtime',
      'Pointed at: main > p',
      'It says: 12 opinions',
      'Reply to: reader@example.org',
    ].join('\n'),
    client: { name: 'ragtime-web' },
  })
})

test('a report says nothing about what was not given, and its summary fits the route', () => {
  const report = reportFor(noteFor({ ...plain, body: 'x'.repeat(500) }))
  // The route caps a summary at 200 and refuses nothing longer; it would cut it there
  // anyway, and cutting it here keeps the lead intact.
  assert.equal(report.summary.length, 200)
  assert.ok(report.summary.startsWith('Site feedback: '))
  assert.equal(report.detail, 'Page: /\nSurface: ragtime')
})

test('a repeat the report route already holds is a success', async () => {
  // 200 `{ filed: false, duplicate: true }`: the same words within a day.
  const note = noteFor({ ...plain, body: 'a real note' })
  assert.equal(await sendNote('/problem-reports', note, 'report', answering(200)), 'sent')
})

test('too many is its own answer, and every other failure is one failure', async () => {
  const note = noteFor({ ...plain, body: 'a real note' })
  assert.equal(await sendNote(ENDPOINT, note, 'note', answering(429)), 'too_many')
  assert.equal(outcomeSaid('too_many'), POINT.tooMany)
  assert.equal(await sendNote(ENDPOINT, note, 'note', answering(403)), 'unreachable')
  assert.equal(await sendNote(ENDPOINT, note, 'report', answering(503)), 'unreachable')
  const dead = (async () => {
    throw new TypeError('Failed to fetch')
  }) as unknown as typeof globalThis.fetch
  assert.equal(await sendNote(ENDPOINT, note, 'note', dead), 'unreachable')
})

test('a link can ask for the panel, and anything but 0 is asking', () => {
  assert.equal(feedbackRequested('?feedback=1'), true)
  assert.equal(feedbackRequested('?feedback'), true)
  assert.equal(feedbackRequested('?q=habeas&feedback=open'), true)
  assert.equal(feedbackRequested('?feedback=0'), false)
  assert.equal(feedbackRequested('?q=feedback'), false)
  assert.equal(feedbackRequested(''), false)
})

test('a report sent to the worker carries the tags, and one sent elsewhere does not', async () => {
  configureWorkerClient({ baseUrl: 'http://worker.test', tags: { client: 'ragtime-web', interaction: 'ix-9' } })
  const note = noteFor({ ...plain, body: 'hello' })
  const worker = recording(200)
  assert.equal(await sendNote('http://worker.test/problem-reports', note, 'report', worker.fetchImpl), 'sent')
  const sentHeaders = worker.seen.init?.headers as Record<string, string>
  assert.equal(sentHeaders['x-rt-client'], 'ragtime-web')
  assert.equal(sentHeaders['x-rt-interaction'], 'ix-9')
  const elsewhere = recording(200)
  assert.equal(await sendNote('https://capture.example/point', note, 'note', elsewhere.fetchImpl), 'sent')
  const otherHeaders = elsewhere.seen.init?.headers as Record<string, string>
  assert.equal('x-rt-client' in otherHeaders, false)
  configureWorkerClient({ tags: {} })
})
