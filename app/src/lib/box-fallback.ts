import type {
  BoxFallback,
  HubKeywordCorpusBlock,
  HubKeywordResponse,
  SearchBoxOptions,
  SemanticSearchRow,
} from '@lawfare/ragtime-client'

/**
 * A corpus page's search box falls back to hybrid search when no document
 * holds every word (the worker's box fallback, opt-in per request).
 *
 * The search box sends `BOX_SEARCH` with its filter request. When keyword
 * search finds nothing for a bare word search, the reply keeps its empty
 * answer and carries hybrid search's results beside it under `fallback`, in
 * the row shape the meaning pane renders. A request narrowed by any field but
 * the words does not fall back; the worker decides that, not the page.
 *
 * Each corpus's results list calls `showsFallback` in its empty branch and,
 * when it is true, renders `FallbackResults` instead of its no-match message.
 */
export const BOX_SEARCH: SearchBoxOptions = { fallback: 'hybrid' }

export type BoxFallbackView = {
  /** The filter reply's `fallback`, or undefined when it carried none. */
  reply: BoxFallback | undefined
  /** Open a result in the corpus's detail panel: the shell's resolver from a
   *  result id to its full row. A failure leaves the panel closed. */
  onOpen: (row: SemanticSearchRow) => void | Promise<void>
}

export const FALLBACK_NOTICE =
  'No document holds every word of your search. These are hybrid search’s closest matches, which also search by meaning.'

/** Whether the keyword pane has hybrid results to show in place of nothing:
 *  a fallback with results and no error. */
export function showsFallback(
  fallback: BoxFallbackView | undefined,
): fallback is BoxFallbackView & { reply: BoxFallback } {
  const reply = fallback?.reply
  return !!reply && !reply.error && Array.isArray(reply.results) && reply.results.length > 0
}

/**
 * Search (the hub's box) sends the same option with its words (ragtime-worker
 * #268). Each corpus it asked that holds no document with every word, and
 * searches by meaning, comes back with hybrid search's results beside its
 * empty keyword answer; corpora with keyword matches keep them. The worker
 * decides which corpora fall back, not the page.
 */
export const HUB_SEARCH: SearchBoxOptions = BOX_SEARCH

/** Hybrid search's rows for one of Search's corpus sections, or none: only
 *  for a section whose keyword answer is empty and whose fallback carried
 *  results without an error. */
export function hubFallbackRows(block: HubKeywordCorpusBlock | undefined): SemanticSearchRow[] {
  if (!block || block.error || block.count > 0 || block.results.length > 0) return []
  return showsFallback({ reply: block.fallback, onOpen: () => {} }) ? block.fallback!.results : []
}

/** The corpora of a Search reply that show hybrid search's closest matches,
 *  in the reply's order. Empty when the reply did not fall back. */
export function hubFallbackCorpora<S extends string>(response: HubKeywordResponse): S[] {
  return (Object.keys(response.per_corpus) as S[]).filter(
    (c) => hubFallbackRows(response.per_corpus[c as keyof HubKeywordResponse['per_corpus']]).length > 0,
  )
}

/** Corpora with no search by meaning, which never fall back. */
const NO_MEANING_SEARCH = new Set(['litigation'])

/** Whether a Search reply asked without the fallback has a corpus the
 *  fallback would fill: an empty group, without an error, of a corpus that
 *  searches by meaning. */
export function hubWantsFallback(response: HubKeywordResponse): boolean {
  return Object.entries(response.per_corpus).some(
    ([slug, b]) => !!b && !b.error && b.count === 0 && b.results.length === 0 && !NO_MEANING_SEARCH.has(slug),
  )
}

/**
 * Search shows its keyword results at once and the closest matches after.
 * The fallback runs a search by meaning in each empty corpus, which on the
 * test set adds about thirteen seconds to the median question asked across
 * all corpora (Excellent Exploration, Link 76), so the page asks twice: once
 * without it, and renders that, then once with it. This lays the second
 * reply's fallbacks onto the first reply's empty groups and changes nothing
 * else, so no keyword result moves when the closest matches arrive.
 */
export function withHubFallbackFrom(first: HubKeywordResponse, second: HubKeywordResponse): HubKeywordResponse {
  const per_corpus = { ...first.per_corpus }
  for (const slug of Object.keys(per_corpus) as (keyof typeof per_corpus)[]) {
    const mine = per_corpus[slug]
    const fallback = second.per_corpus[slug]?.fallback
    if (!mine || !fallback || mine.error || mine.count > 0 || mine.results.length > 0) continue
    per_corpus[slug] = { ...mine, fallback }
  }
  return { ...first, per_corpus }
}
