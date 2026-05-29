import type { CorpusSpoke } from '../types'
import { fetchCfrFacets } from '@/lib/worker-client'

/**
 * CFR (Code of Federal Regulations) spoke — v1 alpha (manual filter +
 * section detail).
 *
 * Per brief #4, CFR shares USC's reference-lookup paradigm — title →
 * chapter → part → subpart → section, with retrieval / filtering /
 * analytical co-equal. CFR is much larger than USC (227K sections vs
 * 60K) and has its own "reserved" placeholder concept (~7K sections)
 * instead of USC's positive-law flag.
 *
 * v1 alpha (this PR): keyword + metadata filtering plus the section
 * detail view. The three flagship AI tasks (compliance / authority /
 * framework synthesis), the curated scopes library (rule packages +
 * agency-derived + subject-matter buckets), the definitional layer, and
 * cross-corpus joins all land in follow-up PRs.
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
          'AI modes (compliance / authority / framework synthesis), the curated scopes library, the definitional layer, and cross-corpus joins all land in follow-up PRs.',
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

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
