import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_WORKER_URL } from '../src/config.ts'
import {
  fetchStateCodeSection,
  fetchStateCodesFacets,
  fetchStateCodesItemsByIds,
  runSemanticSearch,
  runStateCodesFilter,
  type StateCodeSectionDetail,
  type StateCodeSectionDisplayRow,
  type StateCodesFilterResult,
} from '../src/worker-client.ts'

// The State Codes calls are built ahead of the Worker routes they call
// (state_codes is proposed, not registered). These tests pin the request each
// call sends and the reply shape it reads, so the Worker can be built to the
// same contract. The Worker is stubbed: nothing here leaves the process.

type Seen = { url: string; method: string; body: unknown }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replace the global fetch with one that answers once and records the request. */
function answering(status: number, body: unknown): Seen[] {
  const seen: Seen[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return seen
}

const row: StateCodeSectionDisplayRow = {
  member: 'dc',
  id: 4410,
  citation: 'D.C. Code § 22-1315',
  section_identifier: '22-1315',
  heading: 'Repealed.',
  title_num: '22',
  title_name: 'Criminal Offenses and Penalties.',
  chapter: 'Chapter 13. Disorderly Conduct.',
  status: 'repealed',
  recodified_to: null,
  has_temporary_text: false,
  applicable_on: null,
  codified_date: '2026-11-03',
  text_length: 0,
}

describe('/corpus/state_codes/facets', () => {
  it('POSTs an empty body for every member, or names one', async () => {
    let seen = answering(200, { members: {} })
    await fetchStateCodesFacets()
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/state_codes/facets`)
    assert.equal(seen[0].method, 'POST')
    assert.deepEqual(seen[0].body, {})

    seen = answering(200, { members: {} })
    await fetchStateCodesFacets('dc')
    assert.deepEqual(seen[0].body, { member: 'dc' })
  })

  it('surfaces the Worker error message', async () => {
    answering(503, { error: { message: 'corpus is building' } })
    await assert.rejects(fetchStateCodesFacets(), /state_codes\/facets failed \(503\): corpus is building/)
  })
})

describe('/corpus/state_codes/filter', () => {
  it('sends { fields, fallback } with the member and the in-force toggle as given', async () => {
    const reply: StateCodesFilterResult = {
      member: 'dc',
      ids: [4410],
      display_rows: [row],
      count: 1,
      status_counts: { in_force: 3, repealed: 1 },
      generated_sql: '',
      executed_sql: 'SELECT …',
    }
    const seen = answering(200, reply)
    const r = await runStateCodesFilter(
      { member: 'dc', search: 'demonstration', title: '22', inForceOnly: true },
      { fallback: 'hybrid' },
    )
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/state_codes/filter`)
    assert.deepEqual(seen[0].body, {
      fields: { member: 'dc', search: 'demonstration', title: '22', inForceOnly: true },
      fallback: 'hybrid',
    })
    assert.deepEqual(r.status_counts, { in_force: 3, repealed: 1 })
    assert.equal(r.display_rows[0].status, 'repealed')
  })

  it('leaves fallback off when not asked', async () => {
    const seen = answering(200, { ids: [], display_rows: [], count: 0, status_counts: {} })
    await runStateCodesFilter({ member: 'dc', citation: '22-1307' })
    assert.deepEqual(seen[0].body, { fields: { member: 'dc', citation: '22-1307' } })
  })
})

describe('/corpus/state_codes/section', () => {
  const detail: StateCodeSectionDetail = {
    ...row,
    subchapter: null,
    part: null,
    structure_path: 'Title 22 > Chapter 13 > § 22-1315',
    text_content: null,
    source_credit: null,
    notes: null,
    history: [],
    source_reason: 'Repealed',
    build_date: '2026-11-03',
  }

  it('opens a section by member and id, and returns body.section', async () => {
    const seen = answering(200, { member: 'dc', section: detail })
    const d = await fetchStateCodeSection({ member: 'dc', id: 4410 })
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/state_codes/section`)
    assert.deepEqual(seen[0].body, { member: 'dc', id: 4410 })
    assert.equal(d.source_reason, 'Repealed')
  })

  it('opens a section by section number (how recodified_to points)', async () => {
    const seen = answering(200, { member: 'dc', section: detail })
    await fetchStateCodeSection({ member: 'dc', section_identifier: '22-1307' })
    assert.deepEqual(seen[0].body, { member: 'dc', section_identifier: '22-1307' })
  })
})

describe('/corpus/state_codes/items-by-ids', () => {
  it('sends one member and its ids, and reads display_rows', async () => {
    const seen = answering(200, { display_rows: [row] })
    const rows = await fetchStateCodesItemsByIds('dc', [4410])
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/state_codes/items-by-ids`)
    assert.deepEqual(seen[0].body, { member: 'dc', ids: [4410] })
    assert.equal(rows[0].citation, 'D.C. Code § 22-1315')
  })

  it('does not call the Worker for no ids', async () => {
    const seen = answering(200, { display_rows: [] })
    assert.deepEqual(await fetchStateCodesItemsByIds('dc', []), [])
    assert.equal(seen.length, 0)
  })
})

describe('semantic search for one member', () => {
  it('asks /corpus/semantic-search for the member-scoped slug', async () => {
    const seen = answering(200, { corpus: 'state_codes:dc', query: 'q', mode: 'semantic', results: [], branches: {} })
    await runSemanticSearch('state_codes:dc', 'public emergency', { mode: 'semantic' })
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/semantic-search`)
    assert.equal((seen[0].body as { corpus: string }).corpus, 'state_codes:dc')
  })
})
