import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_WORKER_URL } from '../src/config.ts'
import {
  MyCollectionsError,
  addMyCollectionItem,
  createMyCollection,
  deleteMyCollection,
  exportMyCollection,
  getMyCollection,
  listMyCollections,
  probeMyCollections,
  removeMyCollectionItem,
  updateMyCollection,
  type MyCollection,
  type MyCollectionItem,
} from '../src/my-collections.ts'

// These calls act for one signed-in account. What is pinned here:
//
//   - the session token goes in the Authorization header and nowhere else, and
//     no other credential is ever sent;
//   - a 404 from the list route means "not switched on" to the probe, and is
//     an error to every other call;
//   - a document id leaves as text, whatever it was given as.

const TOKEN = 'jwt-token'
const ID = '11111111-0000-4000-8000-000000000001'
const ITEM_ID = '22222222-0000-4000-8000-000000000002'

const collection: MyCollection = {
  id: ID, name: 'Habeas cases', scope: 'private', org: null, created_by_me: true, can_manage: true,
  can_share: true, can_make_private: false, item_count: 0, created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
}
const item: MyCollectionItem = {
  id: ITEM_ID, corpus: 'olc', doc_id: '1425', natural_key: null, source_url: null, title: 'Presidential Control of Wireless',
  quote: null, added_by_me: true, added_at: '2026-10-02T00:00:01Z',
}

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown }

/** A fetch that answers once and records what it was asked. */
function answering(status: number, body: unknown, contentType = 'application/json') {
  const seen: Seen[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(status === 204 ? null : text, { status, headers: { 'Content-Type': contentType } })
  }
  return { fetch, seen }
}

describe('probeMyCollections: is the feature there', () => {
  it('returns the list when the worker answers', async () => {
    const list = { collections: [collection], org: { slug: 'lawfare' } }
    const { fetch, seen } = answering(200, list)
    assert.deepEqual(await probeMyCollections(TOKEN, { fetch }), list)
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.url, DEFAULT_WORKER_URL + '/me/collections')
    assert.equal(seen[0]!.method, 'GET')
  })

  // The routes are off: the worker answers as it does for any unknown path.
  it('returns null on 404, and does not throw', async () => {
    const { fetch } = answering(404, { error: { message: 'Not found' } })
    assert.equal(await probeMyCollections(TOKEN, { fetch }), null)
  })

  it('returns null on a 404 that is not JSON', async () => {
    const { fetch } = answering(404, 'Not found', 'text/plain')
    assert.equal(await probeMyCollections(TOKEN, { fetch }), null)
  })

  // "Not switched on" and "something went wrong" are different answers.
  it('throws on 401 and on 500, with the worker\'s own words', async () => {
    const denied = answering(401, { error: { message: 'Please sign in.', code: 'sign_in_required' } })
    await assert.rejects(probeMyCollections(TOKEN, { fetch: denied.fetch }), (e: unknown) => {
      assert.ok(e instanceof MyCollectionsError)
      assert.equal(e.status, 401)
      assert.equal(e.code, 'sign_in_required')
      assert.equal(e.message, 'Please sign in.')
      return true
    })
    const broken = answering(500, 'upstream exploded', 'text/plain')
    await assert.rejects(probeMyCollections(TOKEN, { fetch: broken.fetch }), (e: unknown) => {
      assert.ok(e instanceof MyCollectionsError)
      assert.equal(e.status, 500)
      assert.equal(e.code, null)
      return true
    })
  })

  it('lets a network failure through as it is', async () => {
    const fetch: typeof globalThis.fetch = async () => { throw new TypeError('fetch failed') }
    await assert.rejects(probeMyCollections(TOKEN, { fetch }), TypeError)
  })
})

describe('listMyCollections', () => {
  it('treats 404 as an error: only the probe reads it as an answer', async () => {
    const { fetch } = answering(404, { error: { message: 'Not found' } })
    await assert.rejects(listMyCollections(TOKEN, { fetch }), (e: unknown) => e instanceof MyCollectionsError && e.status === 404)
  })
})

describe('the credential', () => {
  it('is the session token as a Bearer header on every call, and never in a body', async () => {
    const calls: Array<(f: typeof globalThis.fetch) => Promise<unknown>> = [
      (fetch) => probeMyCollections(TOKEN, { fetch }),
      (fetch) => listMyCollections(TOKEN, { fetch }),
      (fetch) => createMyCollection(TOKEN, 'x', { fetch }),
      (fetch) => getMyCollection(TOKEN, ID, { fetch }),
      (fetch) => updateMyCollection(TOKEN, ID, { name: 'y' }, { fetch }),
      (fetch) => deleteMyCollection(TOKEN, ID, { fetch }),
      (fetch) => addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1', title: 't' }, { fetch }),
      (fetch) => removeMyCollectionItem(TOKEN, ID, ITEM_ID, { fetch }),
      (fetch) => exportMyCollection(TOKEN, ID, { fetch }),
    ]
    for (const run of calls) {
      const { fetch, seen } = answering(200, { collections: [], org: null, collection, items: [], item })
      await run(fetch)
      assert.equal(seen.length, 1)
      assert.equal(seen[0]!.headers['Authorization'], 'Bearer jwt-token')
      assert.ok(!JSON.stringify(seen[0]!.body ?? {}).includes('jwt-token'))
      // No demo password, no API key, no provider: those name nobody.
      for (const key of ['password', 'user_api_key', 'provider', 'model']) {
        assert.ok(!(key in ((seen[0]!.body ?? {}) as Record<string, unknown>)))
      }
    }
  })
})

describe('each call asks the route it is named for', () => {
  it('create: POST /me/collections {name}', async () => {
    const { fetch, seen } = answering(201, { collection })
    assert.deepEqual(await createMyCollection(TOKEN, 'Habeas cases', { fetch }), collection)
    assert.deepEqual([seen[0]!.method, seen[0]!.url, seen[0]!.body], ['POST', DEFAULT_WORKER_URL + '/me/collections', { name: 'Habeas cases' }])
    assert.equal(seen[0]!.headers['content-type'], 'application/json')
  })

  it('get: GET /me/collections/:id', async () => {
    const { fetch, seen } = answering(200, { collection, items: [item] })
    assert.deepEqual(await getMyCollection(TOKEN, ID, { fetch }), { collection, items: [item] })
    assert.deepEqual([seen[0]!.method, seen[0]!.url], ['GET', `${DEFAULT_WORKER_URL}/me/collections/${ID}`])
  })

  it('update: PATCH /me/collections/:id with only what was asked', async () => {
    const shared: MyCollection = { ...collection, scope: 'org', org: { slug: 'lawfare' } }
    const one = answering(200, { collection: shared })
    assert.deepEqual(await updateMyCollection(TOKEN, ID, { share: 'org' }, { fetch: one.fetch }), shared)
    assert.deepEqual([one.seen[0]!.method, one.seen[0]!.url, one.seen[0]!.body], ['PATCH', `${DEFAULT_WORKER_URL}/me/collections/${ID}`, { share: 'org' }])
    const two = answering(200, { collection })
    await updateMyCollection(TOKEN, ID, { name: 'New', share: 'private' }, { fetch: two.fetch })
    assert.deepEqual(two.seen[0]!.body, { name: 'New', share: 'private' })
  })

  it('delete: DELETE /me/collections/:id', async () => {
    const { fetch, seen } = answering(200, { deleted: true, id: ID })
    await deleteMyCollection(TOKEN, ID, { fetch })
    assert.deepEqual([seen[0]!.method, seen[0]!.url, seen[0]!.body], ['DELETE', `${DEFAULT_WORKER_URL}/me/collections/${ID}`, undefined])
  })

  it('remove item: DELETE /me/collections/:id/items/:itemId', async () => {
    const { fetch, seen } = answering(200, { removed: true, id: ITEM_ID })
    await removeMyCollectionItem(TOKEN, ID, ITEM_ID, { fetch })
    assert.deepEqual([seen[0]!.method, seen[0]!.url], ['DELETE', `${DEFAULT_WORKER_URL}/me/collections/${ID}/items/${ITEM_ID}`])
  })

  it('export: GET /me/collections/:id/export, returned as the text it is', async () => {
    const text = 'rt://olc/1425\nrt://congress:hearings/CHRG-117hhrg1\n'
    const { fetch, seen } = answering(200, text, 'text/plain; charset=utf-8')
    assert.equal(await exportMyCollection(TOKEN, ID, { fetch }), text)
    assert.deepEqual([seen[0]!.method, seen[0]!.url], ['GET', `${DEFAULT_WORKER_URL}/me/collections/${ID}/export`])
  })

  it('a path segment cannot escape its place', async () => {
    const { fetch, seen } = answering(200, { collection, items: [] })
    await getMyCollection(TOKEN, '../../api/balance', { fetch })
    assert.equal(seen[0]!.url, `${DEFAULT_WORKER_URL}/me/collections/..%2F..%2Fapi%2Fbalance`)
  })
})

describe('addMyCollectionItem', () => {
  it('sends the id as text, whatever it was given as', async () => {
    for (const [given, sent] of [[1425, '1425'], ['007', '007'], ['12345678901234567890123', '12345678901234567890123'], ['bills:75567', 'bills:75567']] as const) {
      const { fetch, seen } = answering(201, { item, duplicate: false })
      await addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: given, title: 'T' }, { fetch })
      const body = seen[0]!.body as Record<string, unknown>
      assert.equal(body.doc_id, sent)
      assert.equal(typeof body.doc_id, 'string')
      assert.equal(seen[0]!.url, `${DEFAULT_WORKER_URL}/me/collections/${ID}/items`)
      assert.equal(seen[0]!.method, 'POST')
    }
  })

  it('leaves out what was not given', async () => {
    const bare = answering(201, { item, duplicate: false })
    await addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1', title: 'T', quote: '', source_url: null }, { fetch: bare.fetch })
    assert.deepEqual(bare.seen[0]!.body, { corpus: 'olc', doc_id: '1', title: 'T' })
    const full = answering(201, { item, duplicate: false })
    await addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1', title: 'T', quote: 'q', source_url: 'https://x.gov/1', natural_key: '1 Op. O.L.C. 1' }, { fetch: full.fetch })
    assert.deepEqual(full.seen[0]!.body, { corpus: 'olc', doc_id: '1', title: 'T', natural_key: '1 Op. O.L.C. 1', source_url: 'https://x.gov/1', quote: 'q' })
  })

  it('says when the item was already there', async () => {
    const fresh = answering(201, { item, duplicate: false })
    assert.deepEqual(await addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1425', title: 'T' }, { fetch: fresh.fetch }), { item, duplicate: false })
    const again = answering(200, { item, duplicate: true })
    assert.deepEqual(await addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1425', title: 'T' }, { fetch: again.fetch }), { item, duplicate: true })
  })

  it('throws the worker\'s refusal: a full collection, a collection that is gone', async () => {
    const full = answering(400, { error: { message: 'This collection already has 500 items.', code: 'item_limit' } })
    await assert.rejects(addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1', title: 'T' }, { fetch: full.fetch }), (e: unknown) =>
      e instanceof MyCollectionsError && e.status === 400 && e.code === 'item_limit' && e.message === 'This collection already has 500 items.')
    const gone = answering(404, { error: { message: 'Collection not found.', code: 'not_found' } })
    await assert.rejects(addMyCollectionItem(TOKEN, ID, { corpus: 'olc', doc_id: '1', title: 'T' }, { fetch: gone.fetch }), (e: unknown) =>
      e instanceof MyCollectionsError && e.status === 404)
  })
})
