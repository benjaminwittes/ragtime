import type { CorpusSpoke } from '../types'

/**
 * FRUS (Foreign Relations of the United States) spoke (stub — coming-soon
 * at v1).
 *
 * Per brief #5, FRUS is paradigmatically analytical/narrative-synthesis —
 * users ask "Tell me about US-Iran relations in 1979" and the system pulls
 * the relevant documents from the State Department's documentary history
 * series and synthesizes. Retrieval and filtering are present but secondary;
 * the corpus's natural unit is the volume + the document within.
 *
 * Counts mirror CLAUDE.md as of the 2026-05-23 ingest: 314,483 documents
 * across 694 volumes spanning 1620 → 1991.
 */
export const frusSpoke: CorpusSpoke = {
  slug: 'frus',
  title: 'Foreign Relations of the United States',
  description:
    'State Department documentary history of US foreign policy — the FRUS series, spanning 1620 to 1991.',
  status: 'coming-soon',

  plainEnglishDisclosure:
    'FRUS is the official documentary record of major US foreign-policy decisions and diplomatic activity, declassified and published by the State Department Office of the Historian.',

  getHoldings: async () => ({
    counts: { documents: 314_483, volumes: 694 },
    coverage: '1620 → 1991',
    lastUpdated: '2026-05-23',
    knownGaps: [
      'FRUS publication is a lagging series — post-1991 volumes are released gradually as declassification clears.',
    ],
  }),

  queryModes: ['manual_filter', 'claude_analysis', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
