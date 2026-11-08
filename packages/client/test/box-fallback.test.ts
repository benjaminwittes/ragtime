// A corpus page's search box asks its filter route for hybrid search's
// results when no document holds every word (`SearchBoxOptions.fallback`).
// Callers that do not ask send the body they always sent.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { configureWorkerClient } from '../src/config.ts'
import {
  runCongressFilter,
  runHubKeyword,
  runFrFilter,
  runLawfareFilter,
  runOlcFilter,
  runSanctionsEntityFilter,
} from '../src/worker-client.ts'

type Seen = { url: string; body: unknown }

/** Replace the global fetch for one call and hand back what it posted. */
async function posting(run: () => Promise<unknown>): Promise<Seen> {
  const real = globalThis.fetch
  const seen: Seen = { url: '', body: undefined }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.url = String(input)
    seen.body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ ids: [], count: 0, display_rows: [] }), { status: 200 })
  }) as typeof globalThis.fetch
  try {
    await run()
  } finally {
    globalThis.fetch = real
  }
  return seen
}

configureWorkerClient({ baseUrl: 'http://worker.test' })

test('a search box that asks sends fallback beside its fields', async () => {
  const fr = await posting(() => runFrFilter({ search: 'blocked persons' }, { fallback: 'hybrid' }))
  assert.equal(fr.url, 'http://worker.test/corpus/fr/filter')
  assert.deepEqual(fr.body, { fields: { search: 'blocked persons' }, fallback: 'hybrid' })

  const lawfare = await posting(() => runLawfareFilter({ q: 'drones' }, { fallback: 'hybrid' }))
  assert.deepEqual(lawfare.body, { fields: { q: 'drones' }, fallback: 'hybrid' })

  const congress = await posting(() =>
    runCongressFilter({ collection: 'hearings', search: 'x' }, { fallback: 'hybrid' }))
  assert.deepEqual(congress.body, { fields: { collection: 'hearings', search: 'x' }, fallback: 'hybrid' })
})

test('a caller that does not ask sends the body it always sent', async () => {
  const olc = await posting(() => runOlcFilter({ search: 'war powers' }))
  assert.deepEqual(olc.body, { fields: { search: 'war powers' } })
  const empty = await posting(() => runOlcFilter({ search: 'war powers' }, {}))
  assert.deepEqual(empty.body, { fields: { search: 'war powers' } })
})

test('the sanctions entity form has no fallback to ask for', async () => {
  const entity = await posting(() => runSanctionsEntityFilter({ search: 'x' }))
  assert.equal('fallback' in (entity.body as object), false)
})

test('Search that asks sends fallback beside its words and corpora', async () => {
  const hub = await posting(() => runHubKeyword('war powers', ['olc'], { fallback: 'hybrid' }))
  assert.equal(hub.url, 'http://worker.test/corpus/hub/keyword')
  assert.deepEqual(hub.body, { query: 'war powers', corpora: ['olc'], fallback: 'hybrid' })
})

test('Search that does not ask sends the body it always sent', async () => {
  const hub = await posting(() => runHubKeyword('war powers', ['olc']))
  assert.deepEqual(hub.body, { query: 'war powers', corpora: ['olc'] })
})
