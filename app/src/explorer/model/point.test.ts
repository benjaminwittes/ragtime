import { test } from 'vitest'
import assert from 'node:assert/strict'

import { POINT, noteFor, outcomeSaid, sendNote } from './point.ts'

const ENDPOINT = '/feedback/point'

function answering(status: number): typeof globalThis.fetch {
  return (async () => new Response('{}', { status })) as unknown as typeof globalThis.fetch
}

test('a note carries the surface, and empty strings where nothing was pointed at', () => {
  assert.deepEqual(noteFor({ body: '  the trail is confusing  ', route: '#/', selector: null, quote: null }), {
    surface: 'explorer',
    body: 'the trail is confusing',
    route: '#/',
    selector: '',
    quote: '',
  })
})

test('a note with no words in it is refused before any request is made', async () => {
  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}', { status: 201 })
  }) as unknown as typeof globalThis.fetch
  const note = noteFor({ body: '   ', route: '#/', selector: null, quote: null })
  assert.equal(await sendNote(ENDPOINT, note, fetchImpl), 'empty')
  assert.equal(called, false)
})

test('the note goes as JSON to the address the build named', async () => {
  const seen: { url?: string; init?: RequestInit } = {}
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.url = url
    seen.init = init
    return new Response('{}', { status: 201 })
  }) as unknown as typeof globalThis.fetch
  const note = noteFor({ body: 'a real note', route: '#/', selector: 'main > p', quote: 'x' })
  assert.equal(await sendNote(ENDPOINT, note, fetchImpl), 'sent')
  assert.equal(seen.url, ENDPOINT)
  assert.equal(seen.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(seen.init?.body)), note)
})

test('too many is its own answer, and every other failure is one failure', async () => {
  const note = noteFor({ body: 'a real note', route: '#/', selector: null, quote: null })
  assert.equal(await sendNote(ENDPOINT, note, answering(429)), 'too_many')
  assert.equal(outcomeSaid('too_many'), POINT.tooMany)
  assert.equal(await sendNote(ENDPOINT, note, answering(403)), 'unreachable')
  assert.equal(await sendNote(ENDPOINT, note, answering(500)), 'unreachable')
  const dead = (async () => {
    throw new TypeError('Failed to fetch')
  }) as unknown as typeof globalThis.fetch
  assert.equal(await sendNote(ENDPOINT, note, dead), 'unreachable')
})
