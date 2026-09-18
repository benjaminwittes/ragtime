import type { DocsEntry } from '../types'

/** FRUS per-document Summarize. */
export const frusDocumentSummaryEntry: DocsEntry = {
  slug: 'frus-document-summary',
  title: 'Summarize This Document',
  summary: 'Get a structured AI summary of one FRUS document from its detail panel.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 20,
  content: `
Summarize, on a document's detail panel, returns its provenance (sender,
recipient, place, date, classification at the time), the setting it
intervenes in — grounded in the document rather than in imported history —
its substance in its own framing, the persons it names, and any original FRUS
editorial footnote carrying material context. It describes what the document
says, not whether the policy was right. One model call, cheaper than the
narrative AMA.

**Limits.** A document past the worker's text cap is truncated, with a notice
saying so; most are well under it. A small number of rows have no usable text
at all, and the button is disabled for those.
`.trim(),
}
