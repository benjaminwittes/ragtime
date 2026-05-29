import type { CorpusSpoke } from '../types'
import { fetchUscFacets } from '@/lib/worker-client'

/**
 * USC (United States Code) spoke.
 *
 * Per brief #3, USC is paradigmatically a reference-lookup corpus: the
 * user navigates the title → chapter → section hierarchy, or asks "what
 * does §X say?" and gets the authoritative text. All three flagships are
 * co-equal (retrieval, filtering, analytical).
 *
 * Surfaces:
 * - Manual filter: keyword + metadata filtering (FTS, title, citation,
 *   heading, positive-law, status).
 * - claude_ama (PR 4s): three flagships (Legality / Authority / Topical
 *   synthesis), all served through one mode whose planner picks
 *   output_mode per question shape ("no query-architecture buttons").
 * - Summarize-one-section (PR 4s): an action on the section detail
 *   sheet, not a mode in the selector.
 *
 * v1 ships single-corpus AI. The curated scopes library, the definitional
 * layer, the cross-corpus joins (USC ↔ CFR / OLC / litigation), and
 * historical versioning per brief #3 §6 are deferred — the planner
 * surfaces the Authority-synthesis cross-corpus limitation in a candor
 * note when the user asks a "Can the President do X" type question.
 */
export const uscSpoke: CorpusSpoke = {
  slug: 'usc',
  title: 'United States Code',
  description:
    'The full statutory law of the United States — all 53 titles, current as of release point 119-93.',
  status: 'active',

  plainEnglishDisclosure:
    'The United States Code is the codification of federal statutes. We load the current release point in full; revisions are tracked when new release points ship.',

  getHoldings: async () => {
    // Live counts via /corpus/usc/facets — keeps the hub card in sync
    // with the ingest state even when corpus reloads happen between
    // releases.
    try {
      const f = await fetchUscFacets()
      return {
        counts: { sections: f.section_count, titles: f.titles.length },
        coverage: `All ${f.titles.length} titles · release point ${f.release_point}`,
        lastUpdated: f.release_point,
        knownGaps: [
          'Historical versions (older release points) are not loaded; we track only the current release.',
          'Curated scopes library (UCMJ / Internal Revenue Code / INA / etc. as one-click entry points) and the definitional layer (parsed defined-terms table) are deferred to follow-up PRs.',
          'Cross-corpus joins (USC ↔ CFR for implementing regs, USC ↔ litigation for cases citing a section, USC ↔ OLC for executive interpretation) are deferred pending pipeline ingest work — the AMA flags this when the question would benefit.',
          'Semantic retrieval (pgvector) deferred to Phase 2; keyword underperforms for principle/concept queries like "what laws enshrine due-process principles".',
        ],
      }
    } catch {
      // Fall back to the static counts so the hub still renders if the
      // Worker is briefly unreachable.
      return {
        counts: { sections: 60_416, titles: 53 },
        coverage: 'All 53 titles · release point 119-93',
        lastUpdated: '2026-05-21',
      }
    }
  },

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
