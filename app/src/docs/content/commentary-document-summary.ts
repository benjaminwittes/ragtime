import type { DocsEntry } from '../types'

/** Commentary per-piece Summarize. */
export const commentaryDocumentSummaryEntry: DocsEntry = {
  slug: 'commentary-document-summary',
  title: 'Summarize This Piece',
  summary: 'A structured, attribution-forward summary of one commentary piece.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 20,
  content: `
Summarize, on the piece reader, returns the author's thesis, the steps of the
case they make, the facts and authorities cited, and anything the author
forecasts or concedes — flagged as prediction or caveat, not as fact. It
describes what the author argues, never whether the argument is correct, and
attributes the views to the author and publication rather than to the outlet.
It works on pieces from either publication. One model call, cheaper than the
narrative AMA.

**Limits.** A piece past the worker's text cap is truncated, with a notice.
Some entries, certain podcast episodes among them, are catalog records with
no body text; the button is disabled there, and the piece is readable at its
source.
`.trim(),
}
