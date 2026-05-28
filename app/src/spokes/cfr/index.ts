import type { CorpusSpoke } from '../types'

/**
 * CFR (Code of Federal Regulations) spoke (stub — coming-soon at v1).
 *
 * Per brief #4, CFR shares USC's reference-lookup paradigm — title → chapter
 * → part → section, with retrieval/filtering/analytical co-equal. The CFR
 * is much larger than USC (227K sections vs 60K), so search-quality work
 * matters more for this surface.
 *
 * Counts mirror CLAUDE.md: all 49 titles, 227,554 sections, current as of
 * 2026-05-21.
 */
export const cfrSpoke: CorpusSpoke = {
  slug: 'cfr',
  title: 'Code of Federal Regulations',
  description:
    'Federal agency regulations — all 49 titles, current as of 2026-05-21.',
  status: 'coming-soon',

  plainEnglishDisclosure:
    'The Code of Federal Regulations is the codification of federal agency rules. We load the current edition in full; revisions are tracked as agencies publish new versions.',

  getHoldings: async () => ({
    counts: { sections: 227_554, titles: 49 },
    coverage: 'All 49 titles · current as of 2026-05-21',
    lastUpdated: '2026-05-21',
    knownGaps: [
      'Historical CFR editions are not loaded; we track only the current state.',
    ],
  }),

  queryModes: ['manual_filter', 'claude_analysis', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
