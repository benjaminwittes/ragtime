import type { CorpusSpoke } from '../types'
import { fetchCfrFacets } from '@/lib/worker-client'

/**
 * CFR (Code of Federal Regulations) spoke.
 *
 * Per brief #4, CFR shares USC's reference-lookup paradigm — title →
 * chapter → part → subpart → section, with retrieval / filtering /
 * analytical co-equal. CFR is much larger than USC (227K sections vs
 * 60K) and has its own "reserved" placeholder concept (~7K sections)
 * instead of USC's positive-law flag.
 *
 * Surfaces:
 * - Manual filter: keyword + metadata + hierarchy filtering.
 * - claude_ama (PR 4t): three flagships (Compliance / Authority /
 *   Framework synthesis), all served through one mode whose planner
 *   picks output_mode per question shape.
 * - Summarize-one-section (PR 4t): an action on the section detail
 *   sheet, not a mode in the selector.
 *
 * v1 ships single-corpus AI. The curated scopes library (rule packages +
 * agency-derived + subject-matter buckets), the agency-as-top-level-
 * browse primitive, the definitional layer, and cross-corpus joins
 * (USC↔CFR / CFR↔OLC / CFR↔litigation / CFR↔FR) are deferred — the
 * planner flags cross-corpus and definitional-layer limitations in
 * candor_notes when the question would benefit.
 */
export const cfrSpoke: CorpusSpoke = {
  slug: 'cfr',
  title: 'Code of Federal Regulations',
  description:
    'Federal agency regulations — all 49 titles, current as of 2026-05-21.',
  status: 'active',

  plainEnglishDisclosure:
    'The Code of Federal Regulations is the codification of federal agency rules. We load the current edition in full; revisions are tracked as agencies publish new versions.',

  getHoldings: async () => {
    try {
      const f = await fetchCfrFacets()
      return {
        counts: {
          sections: f.section_count,
          titles: f.titles.length,
          reserved: f.reserved_count,
        },
        coverage: `All ${f.titles.length} titles · current as of ${f.up_to_date_as_of}`,
        lastUpdated: f.up_to_date_as_of,
        knownGaps: [
          'Historical CFR editions are not loaded; we track only the current state.',
          'The agency-as-top-level-browse primitive (~50 agencies derived from title + chapter), the curated scopes library (HIPAA / Reg Z / FAR / NEPA etc.), and the parsed definitional layer are deferred to follow-up PRs.',
          'Cross-corpus joins (USC ↔ CFR via eCFR authorities, CFR ↔ litigation for cases citing a section, CFR ↔ OLC, CFR ↔ FR via NPRM→final-rule trails) are deferred pending pipeline ingest work — the AMA flags this when the question would benefit.',
          'CFR sections amend frequently; a refresh pipeline (eCFR API → corpus reload) is a post-launch high-priority work item.',
        ],
      }
    } catch {
      return {
        counts: { sections: 227_554, titles: 49, reserved: 6_949 },
        coverage: 'All 49 titles · current as of 2026-05-21',
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
