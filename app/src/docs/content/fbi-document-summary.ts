import type { DocsEntry } from '../types'

/** FBI Records per-document Summarize. */
export const fbiDocumentSummaryEntry: DocsEntry = {
  slug: 'fbi-document-summary',
  title: 'Summarize This Document',
  summary: 'A structured AI summary of one Vault document, redactions and gaps included.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 20,
  content: `
Summarize, on a document's detail panel, reads the OCR text and returns what
the document is, what the pages cover, notable memos, names as the record
presents them, program references, the visible FOIA redactions and the
illegible or missing stretches — and, for a recovered document, its Wayback
capture date. One model call, cheaper than the narrative AMA.

**What it will not do.** Invent a date: this corpus has none, and a date
appears only as the document's own text states it. Smooth over garbled OCR:
bad stretches are flagged, not silently fixed. Or editorialize on what the
Bureau did.

**Limits.** A document past the worker's text cap is truncated, with a
notice. A few are catalog records with no OCR text at all; the button is
disabled there and the PDF link holds the original scan.
`.trim(),
}
