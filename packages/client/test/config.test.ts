import { test } from 'node:test'
import assert from 'node:assert/strict'

import { configureWorkerClient, tagHeaders, workerFetch } from '../src/config.ts'

type Seen = { url: string; headers: Record<string, string> }

/** Replace the global fetch for one call and hand back what it saw. */
async function seeing(run: () => Promise<unknown>): Promise<Seen> {
  const real = globalThis.fetch
  const seen: Seen = { url: '', headers: {} }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.url = String(input)
    seen.headers = Object.fromEntries(new Headers(init?.headers).entries())
    return new Response('{}', { status: 200 })
  }) as typeof globalThis.fetch
  try {
    await run()
  } finally {
    globalThis.fetch = real
  }
  return seen
}

test('tags are headers, empties left out, and a function is read per request', () => {
  configureWorkerClient({ tags: {} })
  assert.deepEqual(tagHeaders(), {})
  configureWorkerClient({ tags: { client: 'ragtime-web', surface: '', interaction: undefined } })
  assert.deepEqual(tagHeaders(), { 'x-rt-client': 'ragtime-web' })
  let surface = 'hub'
  configureWorkerClient({ tags: () => ({ client: 'ragtime-web', surface, interaction: 'ix-1' }) })
  assert.deepEqual(tagHeaders(), { 'x-rt-client': 'ragtime-web', 'x-rt-surface': 'hub', 'x-rt-interaction': 'ix-1' })
  surface = 'usc'
  assert.equal(tagHeaders()['x-rt-surface'], 'usc')
})

test('workerFetch puts the tags on and a header the caller set wins', async () => {
  configureWorkerClient({ tags: { client: 'ragtime-web', surface: 'hub' } })
  const plain = await seeing(() => workerFetch('http://worker.test/corpus/filter', { method: 'POST', headers: { 'content-type': 'application/json' } }))
  assert.equal(plain.headers['x-rt-client'], 'ragtime-web')
  assert.equal(plain.headers['x-rt-surface'], 'hub')
  assert.equal(plain.headers['content-type'], 'application/json')
  assert.equal('x-rt-interaction' in plain.headers, false)

  const overridden = await seeing(() => workerFetch('http://worker.test/x', { headers: new Headers({ 'x-rt-surface': 'explorer' }) }))
  assert.equal(overridden.headers['x-rt-surface'], 'explorer')
  assert.equal(overridden.headers['x-rt-client'], 'ragtime-web')

  const bare = await seeing(() => workerFetch('http://worker.test/y'))
  assert.equal(bare.headers['x-rt-client'], 'ragtime-web')
})

test('the tags half and the URL half of configureWorkerClient are independent', () => {
  configureWorkerClient({ baseUrl: 'http://worker.test/' })
  assert.equal(tagHeaders()['x-rt-client'], 'ragtime-web')
  configureWorkerClient({ tags: {} })
  assert.deepEqual(tagHeaders(), {})
})
