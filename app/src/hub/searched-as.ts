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
