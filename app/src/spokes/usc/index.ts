import type { CorpusSpoke } from '../types'

/**
 * USC (United States Code) spoke (stub — coming-soon at v1).
 *
 * Per brief #3, USC is paradigmatically a reference-lookup corpus: the user
 * navigates the title → chapter → section hierarchy, or asks "what does §X
 * say?" and gets the authoritative text. All three flagships are co-equal
 * (retrieval, filtering, analytical) since users will also ask cross-cutting
 * questions like "find sections mentioning X across all 53 titles".
 *
 * Counts mirror CLAUDE.md: all 53 titles, 60,416 sections, release point
 * 119-93.
 */
export const uscSpoke: CorpusSpoke = {
  slug: 'usc',
  title: 'United States Code',
  description:
    'The full statutory law of the United States — all 53 titles, current as of release point 119-93.',
  status: 'coming-soon',

  plainEnglishDisclosure:
    'The United States Code is the codification of federal statutes. We load the current release point in full; revisions are tracked when new release points ship.',

  getHoldings: async () => ({
    counts: { sections: 60_416, titles: 53 },
    coverage: 'All 53 titles · release point 119-93',
    lastUpdated: '2026-05-21',
    knownGaps: [
      'Historical versions (older release points) are not loaded; we track only the current release.',
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
