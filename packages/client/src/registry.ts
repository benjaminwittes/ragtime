/**
 * `GET /corpus/registry` — the machine-readable corpus roster, typed.
 *
 * The worker's `registry.js` is the one source of truth for per-corpus
 * facts; this route publishes it as one document. No credential; an IP rate
 * limit is the only gate, and the response is edge-cached for thirty minutes.
 * Empty states, corpus chips and the orient system prompt all read from here
 * rather than from a hand-kept list.
 */

import { workerUrl } from './config.ts'

export type RegistryFreshness = {
  /** `liveness` only where GET /status's one data-freshness probe reads that corpus. */
  source: 'liveness' | null
}

export type RegistrySearch = {
  keyword: boolean
  semantic: boolean
  hub_ama: boolean
  filter: boolean
  facets: boolean
  plan_execute: boolean
  summarize: boolean
  more_like_this: boolean
}

export type RegistryEntry = {
  slug: string
  /** Short, stable display name. No counts or dates — those belong to the corpus itself. */
  name: string
  kind: string
  shape: string
  source_of_record: string
  via: string | null
  /** Backing Postgres relations the slug's hand-written route SQL reads. */
  tables: string[]
  /** Collection key → chunk corpus, for a slug that is one spoke fanning over several; null otherwise. */
  members: Record<string, string> | null
  /** More-like-this keys → doc_chunks corpora. */
  mlt: Record<string, string>
  /** Ordinals in the derived rosters; a missing key means "not on that list". */
  lists: Partial<Record<'hub' | 'semantic' | 'handoff', number>>
  search: RegistrySearch
  /** Route names the slug's spoke dispatches literally. */
  spoke: string[]
  detail_route: string | null
  freshness: RegistryFreshness
}

export type CorpusRegistry = {
  /** Changes whenever an entry changes; cheap to compare. */
  version: string
  count: number
  corpora: RegistryEntry[]
  lists: {
    hub: string[]
    semantic: string[]
    ama: string[]
    handoff: string[]
  }
  more_like_this: Record<string, string>
}

export type FetchRegistryOptions = {
  signal?: AbortSignal
  fetch?: typeof globalThis.fetch
}

export async function fetchRegistry(opts: FetchRegistryOptions = {}): Promise<CorpusRegistry> {
  const doFetch = opts.fetch ?? globalThis.fetch
  const r = await doFetch(`${workerUrl()}/corpus/registry`, { method: 'GET', signal: opts.signal })
  if (!r.ok) throw new Error(`GET /corpus/registry failed: HTTP ${r.status}`)
  return (await r.json()) as CorpusRegistry
}
