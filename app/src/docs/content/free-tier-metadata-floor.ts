import type { DocsEntry } from '../types'

/** Global "What's free: the metadata floor" entry. */
export const freeTierMetadataFloorEntry: DocsEntry = {
  slug: 'free-tier-metadata-floor',
  title: "What's Free: The Metadata Floor",
  summary: 'Structured filtering — not just keyword search — is free on every corpus.',
  scope: { kind: 'global' },
  order: 6,
  content: `
The free tier on every corpus includes structured-metadata filtering, not
just full-text keyword search: dates, titles and headings, courts and
agencies, classification, positive-law status, document type — every native
structured field a corpus carries.

The more you filter on objective fields, the more precisely you can define
and check the set you are working with. It is also much faster than an AI
call, and it reserves the AI layer, which costs real money, for small sets
bounded by known parameters.
`.trim(),
}
