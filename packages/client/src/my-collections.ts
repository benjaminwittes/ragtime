/**
 * A signed-in person's own collections: named lists of citations, private or
 * shared with their organization. The worker's `/me/collections` routes.
 *
 * Not the litigation collections (`fetchCollections` in worker-client.ts,
 * `/corpus/collections`): those are lists the project curates and anyone can
 * read. These belong to an account, so every call here takes that account's
 * session token and nothing else. A demo password or a person's own API key
 * names nobody, and the worker answers 401 to them.
 *
 * The routes may not be switched on yet. Until they are, the worker answers
 * 404 to all of them, exactly as it does for a path it has never heard of.
 * `probeMyCollections` is the one call that reads that as an answer rather
 * than an error: it returns null, and a caller shows nothing.
 */

import { tagHeaders, workerUrl } from './config.ts'

export type MyCollectionScope = 'private' | 'org'

export type MyCollection = {
  id: string
  name: string
  /** `private`: mine alone. `org`: every member of my organization can open it. */
  scope: MyCollectionScope
  org: { slug: string } | null
  created_by_me: boolean
  /** May rename and delete it. */
  can_manage: boolean
  /** May move it to my organization (it is private and I am a member of one). */
  can_share: boolean
  /** May move it back to private (it is shared and I created it). */
  can_make_private: boolean
  item_count: number
  created_at: string
  updated_at: string
}

export type MyCollectionItem = {
  id: string
  /** A registry slug, or `<slug>:<member>` (`congress:hearings`). */
  corpus: string
  /** Always text. Ids come in every shape, and a long one does not survive being a number. */
  doc_id: string
  natural_key: string | null
  source_url: string | null
  title: string
  quote: string | null
  added_by_me: boolean
  added_at: string
}

export type MyCollectionsList = {
  collections: MyCollection[]
  /** The organization I am an active member of, when there is one. */
  org: { slug: string } | null
  limits?: { collections: number; items: number; name: number; quote: number }
}

export type MyCollectionWithItems = { collection: MyCollection; items: MyCollectionItem[] }

export type NewMyCollectionItem = {
  corpus: string
  doc_id: string | number
  title: string
  natural_key?: string | null
  source_url?: string | null
  quote?: string | null
}

export type MyCollectionsOptions = {
  /** Injectable for tests; defaults to the global. */
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

/** A refusal from the worker, with its HTTP status and (when it sent one) its code. */
export class MyCollectionsError extends Error {
  status: number
  code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'MyCollectionsError'
    this.status = status
    this.code = code
  }
}

const ROOT = '/me/collections'

function path(...segments: string[]): string {
  return [ROOT, ...segments.map((s) => encodeURIComponent(s))].join('/')
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  urlPath: string,
  sessionToken: string,
  body: unknown,
  opts: MyCollectionsOptions,
): Promise<Response> {
  const doFetch = opts.fetch ?? globalThis.fetch
  const headers: Record<string, string> = { ...tagHeaders(), Authorization: `Bearer ${sessionToken}` }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (opts.signal) init.signal = opts.signal
  return doFetch(workerUrl() + urlPath, init)
}

async function refusal(r: Response): Promise<MyCollectionsError> {
  let message = `Collections request failed (${r.status})`
  let code: string | null = null
  try {
    const data = (await r.json()) as { error?: { message?: unknown; code?: unknown } }
    if (typeof data.error?.message === 'string') message = data.error.message
    if (typeof data.error?.code === 'string') code = data.error.code
  } catch {
    // Not JSON: the status is all there is to say.
  }
  return new MyCollectionsError(message, r.status, code)
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw await refusal(r)
  return (await r.json()) as T
}

/**
 * Are collections available to this account, and if so, what does it have?
 *
 * `null` means the worker does not have the routes switched on (HTTP 404).
 * That is the feature-detection answer: show no menu entry and no save
 * control. Anything else that is not a success (401, 5xx) throws, because
 * "not switched on" and "something went wrong" are different things to know.
 */
export async function probeMyCollections(
  sessionToken: string,
  opts: MyCollectionsOptions = {},
): Promise<MyCollectionsList | null> {
  const r = await call('GET', ROOT, sessionToken, undefined, opts)
  if (r.status === 404) return null
  return json<MyCollectionsList>(r)
}

/** My private collections and my organization's. Throws when the routes are off; see `probeMyCollections`. */
export async function listMyCollections(
  sessionToken: string,
  opts: MyCollectionsOptions = {},
): Promise<MyCollectionsList> {
  return json<MyCollectionsList>(await call('GET', ROOT, sessionToken, undefined, opts))
}

/** A new collection, private to me. */
export async function createMyCollection(
  sessionToken: string,
  name: string,
  opts: MyCollectionsOptions = {},
): Promise<MyCollection> {
  const data = await json<{ collection: MyCollection }>(await call('POST', ROOT, sessionToken, { name }, opts))
  return data.collection
}

/** One collection with its items, in the order they were added. */
export async function getMyCollection(
  sessionToken: string,
  id: string,
  opts: MyCollectionsOptions = {},
): Promise<MyCollectionWithItems> {
  return json<MyCollectionWithItems>(await call('GET', path(id), sessionToken, undefined, opts))
}

/**
 * Rename a collection, move it, or both. `share: 'org'` moves it to my
 * organization; `share: 'private'` moves it back to me, and only the person
 * who created it may do that.
 */
export async function updateMyCollection(
  sessionToken: string,
  id: string,
  change: { name?: string; share?: MyCollectionScope },
  opts: MyCollectionsOptions = {},
): Promise<MyCollection> {
  const data = await json<{ collection: MyCollection }>(await call('PATCH', path(id), sessionToken, change, opts))
  return data.collection
}

export async function deleteMyCollection(
  sessionToken: string,
  id: string,
  opts: MyCollectionsOptions = {},
): Promise<void> {
  await json<unknown>(await call('DELETE', path(id), sessionToken, undefined, opts))
}

/**
 * Save a citation to a collection. `duplicate` is true when it was already
 * there, and `item` is then the one that was. The id is sent as text whatever
 * it was given as.
 */
export async function addMyCollectionItem(
  sessionToken: string,
  id: string,
  item: NewMyCollectionItem,
  opts: MyCollectionsOptions = {},
): Promise<{ item: MyCollectionItem; duplicate: boolean }> {
  const body: Record<string, unknown> = { corpus: item.corpus, doc_id: String(item.doc_id), title: item.title }
  if (item.natural_key) body.natural_key = item.natural_key
  if (item.source_url) body.source_url = item.source_url
  if (item.quote) body.quote = item.quote
  const data = await json<{ item: MyCollectionItem; duplicate?: boolean }>(
    await call('POST', path(id, 'items'), sessionToken, body, opts),
  )
  return { item: data.item, duplicate: data.duplicate === true }
}

export async function removeMyCollectionItem(
  sessionToken: string,
  id: string,
  itemId: string,
  opts: MyCollectionsOptions = {},
): Promise<void> {
  await json<unknown>(await call('DELETE', path(id, 'items', itemId), sessionToken, undefined, opts))
}

/** The collection as text: one `rt://<corpus>/<doc_id>` per line, in the order added. */
export async function exportMyCollection(
  sessionToken: string,
  id: string,
  opts: MyCollectionsOptions = {},
): Promise<string> {
  const r = await call('GET', path(id, 'export'), sessionToken, undefined, opts)
  if (!r.ok) throw await refusal(r)
  return r.text()
}
