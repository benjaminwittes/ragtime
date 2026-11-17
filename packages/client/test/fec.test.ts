import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_WORKER_URL } from '../src/config.ts'
import {
  fetchFecCandidate,
  fetchFecCommittee,
  fetchFecFacets,
  fetchFecItemsByIds,
  runFecFilter,
  type FecCandidateDetail,
  type FecFilterResult,
} from '../src/worker-client.ts'

// The FEC calls are built ahead of the Worker routes they call (fec is
// `building`; the routes are in a parallel ragtime-worker PR). These tests pin
// the request each call sends and the reply shape it reads, so both sides
// build to the same contract. The Worker is stubbed: nothing leaves the process.

type Seen = { url: string; method: string; body: unknown }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replace the global fetch with one that answers and records each request. */
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

const source = {
  kind: 'webl',
  cycle: 2022,
  url: 'https://www.fec.gov/files/bulk-downloads/2022/webl22.zip',
  line: 812,
  sha256: 'abc',
}

describe('/corpus/fec/filter', () => {
  it('POSTs a flat body with only the fields that are set', async () => {
    const reply: FecFilterResult = {
      kind: 'candidate',
      total: 1,
      limit: 25,
      offset: 0,
      results: [
        {
          id: 'S0GA00559',
          name: 'WARNOCK, RAPHAEL',
          office: 'S',
          state: 'GA',
          district: '00',
          party: 'DEM',
          status: 'C',
          latest_cycle: 2028,
          cycles: [2020, 2022, 2024, 2026, 2028],
          pcc: 'C00736876',
        },
      ],
    }
    const seen = answering(200, reply)
    const r = await runFecFilter({
      kind: 'candidate',
      search: 'warnock',
      office: 'S',
      state: undefined,
      party: '',
      cycleFrom: 2020,
    })
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/fec/filter`)
    assert.equal(seen[0].method, 'POST')
    assert.deepEqual(seen[0].body, { kind: 'candidate', search: 'warnock', office: 'S', cycleFrom: 2020 })
    assert.equal(r.kind, 'candidate')
    assert.deepEqual(r.results[0].cycles, [2020, 2022, 2024, 2026, 2028])
  })

  it('surfaces the Worker error message', async () => {
    answering(400, { error: { message: 'unknown field: foo' } })
    await assert.rejects(runFecFilter({ kind: 'committee' }), /fec\/filter failed \(400\): unknown field: foo/)
  })
})

describe('/corpus/fec/facets', () => {
  it('sends the filters without limit or offset', async () => {
    const seen = answering(200, { kind: 'committee', total: 0, facets: {} })
    await fetchFecFacets({ kind: 'committee', cmteType: 'O', ...({ limit: 5, offset: 10 } as object) })
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/fec/facets`)
    assert.deepEqual(seen[0].body, { kind: 'committee', cmteType: 'O' })
  })
})

describe('/corpus/fec/candidate and /committee', () => {
  it('sends { id } and keeps amounts as the exact strings the Worker sent', async () => {
    const detail: FecCandidateDetail = {
      id: 'S0GA00559',
      cycles: [],
      totals: [{ cycle: 2022, source_kind: 'webl', ttl_receipts: '206593947.75', source }],
      summary: [],
      committees: [],
      shared_principal_committee: [],
    }
    const seen = answering(200, detail)
    const r = await fetchFecCandidate('S0GA00559')
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/fec/candidate`)
    assert.deepEqual(seen[0].body, { id: 'S0GA00559' })
    assert.equal(r.totals[0].ttl_receipts, '206593947.75')
    assert.equal(typeof r.totals[0].ttl_receipts, 'string')
  })

  it('posts the committee id and reads joint_fundraiser', async () => {
    const seen = answering(200, { id: 'C00123456', cycles: [], totals: [], candidates: [], joint_fundraiser: true })
    const r = await fetchFecCommittee('C00123456')
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/fec/committee`)
    assert.deepEqual(seen[0].body, { id: 'C00123456' })
    assert.equal(r.joint_fundraiser, true)
  })

  it('surfaces a 404 for an unknown id', async () => {
    answering(404, { error: { message: 'not found' } })
    await assert.rejects(fetchFecCommittee('C00000000'), /fec\/committee failed \(404\)/)
  })
})

describe('/corpus/fec/items-by-ids', () => {
  it('sends kind-qualified ids and reads `results`', async () => {
    const seen = answering(200, {
      results: [{ kind: 'committee', id: 'C00123456', name: 'X', type: 'O', designation: 'U', party: null, state: 'DC', connected_org: null, cand_id: null, latest_cycle: 2024, cycles: [2024] }],
    })
    const r = await fetchFecItemsByIds(['committee:C00123456', 'candidate:H0XX00000'])
    assert.equal(seen[0].url, `${DEFAULT_WORKER_URL}/corpus/fec/items-by-ids`)
    assert.deepEqual(seen[0].body, { ids: ['committee:C00123456', 'candidate:H0XX00000'] })
    assert.equal(r.length, 1)
    assert.equal(r[0].kind, 'committee')
  })

  it('makes no request for no ids', async () => {
    const seen = answering(200, { results: [] })
    assert.deepEqual(await fetchFecItemsByIds([]), [])
    assert.equal(seen.length, 0)
  })
})
