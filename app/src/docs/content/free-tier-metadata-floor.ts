import type { DocsEntry } from '../types'

/**
 * Global "What's free: the metadata floor" entry — structured-metadata
 * filtering (not just keyword search) is free on every corpus, and why
 * that reinforces auditability and reserves the AI layer for focused sets.
 */
export const freeTierMetadataFloorEntry: DocsEntry = {
  slug: 'free-tier-metadata-floor',
  title: "What's Free: The Metadata Floor",
  summary: 'Structured filtering — not just keyword search — is free on every corpus.',
  scope: { kind: 'global' },
  order: 5,
  content: `
On every corpus, the free tier includes structured-metadata filtering, not
just full-text keyword search. That means you can filter by dates, titles
and headings, courts and agencies, classification, positive-law status,
document type — every native structured field the corpus carries is free to
filter on.

This reinforces auditability: the more you can filter by structured fields,
the more precisely you can define — and check — the set you're working
with. It is also much faster than AI calls.

**Use structured metadata whenever you can.** The more you filter using
wholly objective criteria, the more you can reserve the AI layer — which
costs real money to run — for smaller, more-focused datasets bounded by
known parameters.
`.trim(),
}
