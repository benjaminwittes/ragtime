import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize" action on the FBI Records document detail
 * sheet. One billed call over one document's OCR text, with the provenance
 * and OCR-quality context riding along so the summary is honest about what
 * it is reading.
 */
export const fbiDocumentSummaryEntry: DocsEntry = {
  slug: 'fbi-document-summary',
  title: 'Summarize This Document',
  summary:
    'Get a structured AI summary of one Vault document — contents, notable items, redactions and gaps — from its detail panel.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 20,
  content: `
**What it is.** A button on the document detail panel. Click it to generate
a structured summary of the document's OCR text using your configured AI
access.

**The output.** A markdown summary organized around:

- *What this document is* — the file, its collection, which part of a
  multi-part release.
- *Contents* — what the pages cover: subjects, events, correspondence,
  reports.
- *Notable items* — specific memos, names (as the record presents them),
  program references.
- *Redactions & gaps* — visible FOIA redactions, missing pages, illegible
  stretches.
- *Provenance* — for recovered documents: that it was removed from the
  Vault and recovered from a Wayback capture, with the capture date.

**What it will not do.** Invent dates (the corpus has none — dates appear
only as the document's own text states them, attributed as such), smooth
over garbled OCR (bad stretches are flagged, not silently fixed), or
editorialize on what the Bureau did.

**Long documents.** Files longer than the worker's text cap are truncated
before the model sees them; the result surfaces a clear "truncated" notice.

**Documents with no OCR text.** A few documents are catalog records without
recoverable text. The button is disabled for those — the PDF link holds the
original scan.

**Cost.** One model call per summarize. Cheaper than the narrative AMA
because there's no planning step.
`.trim(),
}
