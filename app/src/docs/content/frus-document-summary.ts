import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this document" action on the FRUS document
 * detail sheet. Brief #5 §3 "plus" — not a mode in the selector; an action
 * on the canonical document view.
 */
export const frusDocumentSummaryEntry: DocsEntry = {
  slug: 'frus-document-summary',
  title: 'Summarize This Document',
  summary: 'Get a structured AI summary of one FRUS document from its detail panel.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 20,
  content: `
**What it is.** A button on the document detail side sheet. Click to
generate a structured summary of the document using your configured AI
access.

**The output.** A markdown summary organized around diplomatic-document
conventions:

- *Provenance* — sender / recipient / place / date / classification at the
  time.
- *Setting* — the moment the document intervenes in (1–2 sentences,
  grounded in the document itself, not imported historical context).
- *Substance* — what the document says, in its own framing.
- *Key persons* — named individuals whose views or actions the document
  attributes (only those the document itself names).
- *Notable footnotes / glossary* — when the original FRUS editorial
  footnotes carry historical context that materially aids understanding,
  they're mentioned briefly. Original FRUS footnotes are scholarship.

The summary is attribution-forward: it describes what the document says,
not whether the U.S. policy described was right or wrong. Quotations use
curly quotes; direct quotation is sparse.

**Long documents.** Documents longer than the worker's text cap (most are
well under) are truncated before the model sees them; the result panel
surfaces a clear "truncated" notice.

**Documents with no text.** A small number of corpus rows have no usable
text content. The button is disabled in those cases.

**Cost.** One model call per summarize. Cheaper than the narrative AMA
because there's no planning step.
`.trim(),
}
