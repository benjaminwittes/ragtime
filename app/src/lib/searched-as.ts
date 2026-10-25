import type { SearchBoxReply } from '@lawfare/ragtime-client'

/**
 * The "Searched as" line over Search's results (Thomas, 2026-10-23).
 *
 * The worker reads every Search query under one grammar and reports the
 * reading as `interpreted`. The card shows it only when it says something the
 * reader's own words did not: when the reading differs from the typed text
 * beyond letter case. A plain query such as `youngstown` shows nothing, and
 * the line appears when a lowercase "or" was ignored, a stop word dropped, or
 * an OR grouped. The explanation sits under the results rather than under the
 * box, because the hero's under-the-box row is reserved (2026-09-17 ruling).
 *
 * Returns null when there is nothing to say, including against a worker that
 * predates the field.
 */
export function searchedAsLine(query: string, interpreted: string | undefined): string | null {
  if (interpreted === undefined) return null
  if (interpreted === '') {
    return 'Nothing to search: every word was a common word or an exclusion.'
  }
  if (interpreted === query.trim().replace(/\s+/g, ' ').toLowerCase()) return null
  return `Searched as: ${interpreted}`
}

/**
 * The same line for a corpus page's own search box (2026-10-24). Every corpus
 * but litigation reports `interpreted` on its search-box reply, read from the
 * box's text, under the same rule as Search. `text` is what the page sent as
 * the box (`fields.search`; `fields.q` on lawfare). A browse with an empty box
 * gets no `interpreted`, and neither does a reply from a worker that predates
 * the field, so both show nothing.
 */
export function searchBoxLine(text: string | undefined, reply: SearchBoxReply): string | null {
  return searchedAsLine(text ?? '', reply.interpreted)
}
