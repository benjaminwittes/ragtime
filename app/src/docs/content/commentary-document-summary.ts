import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this piece" action on the Commentary piece
 * reader. Like OLC's per-opinion summarize, this is the "plus" alongside the
 * narrative-synthesis flagship — an action on the piece's reader view, not a
 * mode in the selector.
 */
export const commentaryDocumentSummaryEntry: DocsEntry = {
  slug: 'commentary-document-summary',
  title: 'Summarize This Piece',
  summary:
    'Get a structured, attribution-forward AI summary of one commentary piece from its reader.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 20,
  content: `
**What it is.** A button on the piece reader (where you read the full text).
Click it to generate a structured summary using your configured AI access. Works
on pieces from either publication (Lawfare or Executive Functions).

**The output.** A markdown summary organized around what the piece *argues*:

- *Thesis* — the author's central claim.
- *Argument* — the steps of the case the author makes.
- *Key points / evidence* — the specific facts, authorities, or examples cited.
- *Predictions / caveats* — anything the author forecasts or concedes (flagged
  as such, not as fact).

**Attribution, not adjudication.** This is commentary. The summary describes what
the author argues — it does not tell you whether the argument is correct, and it
attributes the views to the author (and publication), not to either outlet as an
institution.

**Long pieces.** Pieces longer than the worker's text cap are truncated before
the model sees them; the result panel surfaces a clear "truncated" notice.

**Pieces with no body text.** Some entries (e.g. certain podcast episodes) are
catalog records without recoverable body text. The button is disabled for those;
read the full piece at its source via the "Read at source ↗" link.

**Cost.** One model call per summarize. Cheaper than the narrative AMA because
there's no planning step.
`.trim(),
}
