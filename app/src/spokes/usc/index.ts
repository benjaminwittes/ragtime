import type { CorpusSpoke } from '../types'
import { fetchUscFacets } from '@/lib/worker-client'

/**
 * USC (United States Code) spoke — v1 alpha (manual filter only).
 *
 * Per brief #3, USC is paradigmatically a reference-lookup corpus: the
 * user navigates the title → chapter → section hierarchy, or asks "what
 * does §X say?" and gets the authoritative text. All three flagships are
 * co-equal (retrieval, filtering, analytical).
 *
 * v1 alpha (this PR): keyword + metadata filtering only — FTS, title,
 * citation, heading, positive-law, status. AI modes (legality / authority
 * / topical synthesis per brief #3 §3), the curated scopes library, the
 * definitional layer, and cross-corpus joins all land in follow-up PRs.
 *
 * Status flipped to 'active' here so the hub links into the spoke and
 * SpokeShell mounts the USC chassis rather than the coming-soon landing.
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
          'AI modes (legality / authority / topical synthesis), the curated scopes library, the definitional layer, and cross-corpus joins all land in follow-up PRs.',
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

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
