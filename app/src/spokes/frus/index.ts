import type { CorpusSpoke } from '../types'
import { fetchFrusFacets } from '@/lib/worker-client'

/**
 * FRUS (Foreign Relations of the United States) spoke — v1 alpha
 * (manual filter + document detail).
 *
 * Per brief #5, FRUS is paradigmatically analytical/narrative-synthesis —
 * users ask "Tell me about US-Iran relations in 1979" and the system
 * pulls the relevant documents from the State Department's documentary
 * history series and synthesizes. That analytical flagship surface
 * lands in a follow-up PR; v1 alpha is the metadata-floor base.
 *
 * Counts: 314,483 documents across 694 volumes (552 with docs loaded;
 * the remaining 142 are placeholders for the lagging-publication tail).
 * Coverage: 1620 → 1991.
 */
export const frusSpoke: CorpusSpoke = {
  slug: 'frus',
  title: 'Foreign Relations of the United States',
  description:
    'State Department documentary history of US foreign policy — the FRUS series, spanning 1620 to 1991.',
  status: 'active',

  plainEnglishDisclosure:
    'FRUS is the official documentary record of major US foreign-policy decisions and diplomatic activity, declassified and published by the State Department Office of the Historian.',

  getHoldings: async () => {
    try {
      const f = await fetchFrusFacets()
      return {
        counts: {
          documents: f.document_count,
          volumes: f.volume_count,
          with_docs: f.volumes_with_docs,
        },
        coverage: `${f.earliest} → ${f.latest}`,
        lastUpdated: f.latest,
        knownGaps: [
          'FRUS publication is a lagging series — post-1991 volumes are released gradually as declassification clears.',
          `${(f.volume_count - f.volumes_with_docs).toLocaleString()} volumes are placeholder metadata (no documents loaded yet).`,
          'AI modes (the "Tell me about…" analytical flagship per brief #5) land in a follow-up PR.',
        ],
      }
    } catch {
      return {
        counts: { documents: 314_483, volumes: 694, with_docs: 552 },
        coverage: '1620 → 1991',
        lastUpdated: '2026-05-23',
      }
    }
  },

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
