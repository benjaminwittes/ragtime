/**
 * The rule that keeps collections out of sight until the worker has them.
 *
 * The app can ship before the worker's `/me/collections` routes are switched
 * on. These tests pin what a reader sees in that window (nothing), and that a
 * signed-out reader never causes a request at all.
 */

import { describe, expect, it, vi } from 'vitest'
import type { MyCollection, MyCollectionsList } from '@lawfare/ragtime-client'

import {
  detectMyCollections,
  itemCountLabel,
  itemDocumentPath,
  myCollectionPath,
  parseMyCollectionsPath,
  scopeLabel,
} from './availability.ts'

const collection: MyCollection = {
  id: '11111111-0000-4000-8000-000000000001',
  name: 'Habeas cases',
  scope: 'private',
  org: null,
  created_by_me: true,
  can_manage: true,
  can_share: false,
  can_make_private: false,
  item_count: 2,
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
}
const list: MyCollectionsList = { collections: [collection], org: null }

describe('detectMyCollections', () => {
  it('signed out: not available, and the worker is not asked', async () => {
    const probe = vi.fn(async () => list)
    expect(await detectMyCollections(null, probe)).toEqual({ available: false, reason: 'signed-out' })
    expect(await detectMyCollections('', probe)).toEqual({ available: false, reason: 'signed-out' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('the routes are not switched on (the probe saw a 404): not available', async () => {
    const probe = vi.fn(async () => null)
    expect(await detectMyCollections('jwt', probe)).toEqual({ available: false, reason: 'not-switched-on' })
    expect(probe).toHaveBeenCalledExactlyOnceWith('jwt')
  })

  it('the worker refused or could not be reached: not available, and nothing is thrown', async () => {
    for (const failure of [new Error('Collections request failed (500)'), new TypeError('fetch failed'), 'a string']) {
      const probe = vi.fn(async () => { throw failure })
      expect(await detectMyCollections('jwt', probe)).toEqual({ available: false, reason: 'unreachable' })
    }
  })

  it('an answer that is not a list of collections is not a yes', async () => {
    for (const odd of [{}, { collections: 'none' }, { collections: null }]) {
      const probe = vi.fn(async () => odd as unknown as MyCollectionsList)
      expect(await detectMyCollections('jwt', probe)).toEqual({ available: false, reason: 'unreachable' })
    }
  })

  it('the worker answered with a list: available, with that list', async () => {
    const probe = vi.fn(async () => list)
    expect(await detectMyCollections('jwt', probe)).toEqual({ available: true, list })
    // An empty list is still a yes: the person has no collections yet.
    const none = { collections: [], org: { slug: 'lawfare' } }
    expect(await detectMyCollections('jwt', async () => none)).toEqual({ available: true, list: none })
  })
})

describe('parseMyCollectionsPath', () => {
  it('reads the two pages', () => {
    expect(parseMyCollectionsPath('/my/collections')).toEqual({ kind: 'index' })
    expect(parseMyCollectionsPath('/my/collections/')).toEqual({ kind: 'index' })
    expect(parseMyCollectionsPath(myCollectionPath(collection.id))).toEqual({ kind: 'one', id: collection.id })
  })

  it('leaves the curated litigation collections, and everything else, alone', () => {
    for (const path of ['/collections', '/collections/habeas', '/my', '/my/collectionsx', '/my/collections/not-an-id', '/my/collections/' + collection.id + '/extra', '/']) {
      expect(parseMyCollectionsPath(path)).toBeNull()
    }
  })
})

describe('itemDocumentPath', () => {
  it('is the app\'s own document link', () => {
    expect(itemDocumentPath({ corpus: 'olc', doc_id: '1425' })).toBe('/corpus/olc/1425')
    expect(itemDocumentPath({ corpus: 'congress:hearings', doc_id: 'CHRG-117hhrg1' })).toBe('/corpus/congress:hearings/CHRG-117hhrg1')
    expect(itemDocumentPath({ corpus: 'commentary', doc_id: 'lawfare:123' })).toBe('/corpus/commentary/lawfare:123')
    // Kept as text: a leading zero and a long id both survive.
    expect(itemDocumentPath({ corpus: 'litigation', doc_id: '00071906132' })).toBe('/corpus/litigation/00071906132')
  })

  it('is null for something the link grammar cannot address', () => {
    expect(itemDocumentPath({ corpus: 'Not A Slug', doc_id: '1' })).toBeNull()
    expect(itemDocumentPath({ corpus: 'olc', doc_id: 'has/slash' })).toBeNull()
    expect(itemDocumentPath({ corpus: 'olc', doc_id: '' })).toBeNull()
  })
})

describe('labels', () => {
  it('say private or shared in plain words', () => {
    expect(scopeLabel({ scope: 'private' })).toBe('Private')
    expect(scopeLabel({ scope: 'org' })).toBe('Shared with your organization')
  })

  it('count items', () => {
    expect(itemCountLabel(0)).toBe('0 items')
    expect(itemCountLabel(1)).toBe('1 item')
    expect(itemCountLabel(1200)).toBe('1,200 items')
  })
})
