import type { CorpusSpoke } from '../types'
import { fetchFrusFacets } from '@/lib/worker-client'

/**
 * FRUS (Foreign Relations of the United States) spoke.
 *
 * Per brief #5, FRUS is paradigmatically narrative-synthesis — users ask
 * "Tell me about US-Iran relations in 1979" and the system pulls the
 * relevant documents from the State Department's documentary history
 * series and synthesizes chronologically.
 *
 * Surfaces:
 * - Manual filter: keyword + metadata + scopes (FTS, date range, place,
 *   classification, volume, sub-series).
 * - claude_ama (PR 4r): the three asymmetric flagships — narrative
 *   synthesis (paradigmatic) + coverage/existence + specific-document
 *   retrieval — all served through one mode whose planner picks the
 *   output_mode per question shape (no query-architecture buttons).
 * - Summarize-one-document (PR 4r): an action on the document detail
 *   sheet, not a mode in the selector.
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
          'Semantic retrieval (pgvector) deferred to Phase 2; v1 keyword search underperforms most on questions about concepts (containment, deterrence) versus events (Berlin Airlift, Bay of Pigs).',
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

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
}
