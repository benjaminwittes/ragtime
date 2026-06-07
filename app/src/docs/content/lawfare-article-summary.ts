import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this piece" action on the Lawfare article
 * reader. Like OLC's per-opinion summarize, this is the "plus" alongside the
 * narrative-synthesis flagship — not a mode in the selector, but an action on
 * the piece's reader view.
 */
export const lawfareArticleSummaryEntry: DocsEntry = {
  slug: 'lawfare-article-summary',
  title: 'Summarize This Piece',
  summary:
    "Get a structured, attribution-forward AI summary of one Lawfare piece from its reader.",
  scope: { kind: 'spoke', spokeSlug: 'lawfare' },
  order: 20,
  content: `
**What it is.** A button on the article reader (where you read the full piece).
Click it to generate a structured summary of the piece using your configured
AI access.

**The output.** A markdown summary organized around what the piece *argues*:

- *Thesis* — the author's central claim.
- *Argument* — the steps of the case the author makes.
- *Key points / evidence* — the specific facts, authorities, or examples cited.
- *Caveats / counterpoints* — anything the author concedes or qualifies.

**Attribution, not adjudication.** This is commentary. The summary describes
what the author argues — it does not tell you whether the argument is correct,
and it attributes the views to the author rather than to "Lawfare" as an
institution.

**Long pieces.** Pieces longer than the worker's text cap are truncated before
the model sees them. The result panel surfaces a clear "truncated" notice in
that case — the later sections weren't summarized.

**Pieces with no body text.** Some entries (e.g. certain podcast episodes) are
catalog records without recoverable body text. The button is disabled for
those; read the full piece on Lawfare via the "Read on Lawfare ↗" link.

**Cost.** One model call per summarize. Cheaper than the narrative AMA because
there's no planning step.
`.trim(),
}
