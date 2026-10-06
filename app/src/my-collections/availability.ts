/**
 * Whether a reader has collections at all, and the small rules the pages share.
 *
 * No React and no window here, so `availability.test.ts` can pin the one rule
 * that matters most: **when the answer is anything but a clear yes, show
 * nothing.** The app can be deployed before the worker's routes are switched
 * on. Until then the worker answers 404, and no menu entry, save control or
 * page may appear.
 */

import { links, type MyCollection, type MyCollectionItem, type MyCollectionsList } from '@lawfare/ragtime-client'

export type MyCollectionsAvailability =
  | { available: true; list: MyCollectionsList }
  | {
      available: false
      /**
       * `signed-out`: nobody to keep collections for; the worker is not asked.
       * `not-switched-on`: the worker answered 404.
       * `unreachable`: the worker refused or could not be reached. Treated the
       * same as off: a control that may not work is worse than none.
       */
      reason: 'signed-out' | 'not-switched-on' | 'unreachable'
    }

/**
 * Ask once. `probe` is the client's `probeMyCollections`: the list, or null on
 * a 404. It is a parameter so the test can stand in for the worker.
 */
export async function detectMyCollections(
  sessionToken: string | null,
  probe: (sessionToken: string) => Promise<MyCollectionsList | null>,
): Promise<MyCollectionsAvailability> {
  if (!sessionToken) return { available: false, reason: 'signed-out' }
  try {
    const list = await probe(sessionToken)
    if (list === null) return { available: false, reason: 'not-switched-on' }
    if (!Array.isArray(list.collections)) return { available: false, reason: 'unreachable' }
    return { available: true, list }
  } catch {
    return { available: false, reason: 'unreachable' }
  }
}

/** The two pages, as logical paths. */
export const MY_COLLECTIONS_PATH = '/my/collections'
export function myCollectionPath(id: string): string {
  return MY_COLLECTIONS_PATH + '/' + id
}

const COLLECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `/my/collections` and `/my/collections/<id>`, or null for any other path.
 * Kept apart from `/collections`, which is the project's curated litigation
 * collections and open to everyone.
 */
export function parseMyCollectionsPath(pathname: string): { kind: 'index' } | { kind: 'one'; id: string } | null {
  if (pathname === MY_COLLECTIONS_PATH || pathname === MY_COLLECTIONS_PATH + '/') return { kind: 'index' }
  if (!pathname.startsWith(MY_COLLECTIONS_PATH + '/')) return null
  const id = pathname.slice(MY_COLLECTIONS_PATH.length + 1).replace(/\/$/, '')
  return COLLECTION_ID.test(id) ? { kind: 'one', id } : null
}

/**
 * Where an item's title links: the app's own document page, built by the one
 * writer of those paths. Null when the corpus or id is not something that
 * grammar can address; the title is then shown as plain text.
 */
export function itemDocumentPath(item: Pick<MyCollectionItem, 'corpus' | 'doc_id'>): string | null {
  try {
    return links.document({ slug: item.corpus, id: item.doc_id })
  } catch {
    return null
  }
}

/** "Private" or "Shared with your organization". */
export function scopeLabel(collection: Pick<MyCollection, 'scope'>): string {
  return collection.scope === 'org' ? 'Shared with your organization' : 'Private'
}

export function itemCountLabel(n: number): string {
  return n === 1 ? '1 item' : `${n.toLocaleString('en-US')} items`
}
