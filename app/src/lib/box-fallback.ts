import type { BoxFallback, SearchBoxOptions, SemanticSearchRow } from '@lawfare/ragtime-client'

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
