import type { CorpusSpoke } from '../types'
import { fetchLawfareFacets } from '@/lib/worker-client'

/**
 * Lawfare spoke.
 *
 * The platform's first COMMENTARY corpus — Lawfare's own published analysis:
 * articles, podcast episodes, and newsletters from lawfaremedia.org. Unlike
 * the primary-source corpora (litigation, OLC, USC, CFR, FRUS), this is
 * commentary. The synthesis attributes views to authors + pieces; it surfaces
 * what Lawfare authors said, never adjudicates which view is right.
 *
 * Paradigmatically analytical/narrative, like OLC: the user asks "what has
 * Lawfare written/argued about X?" and the system retrieves + synthesizes
 * across the archive, with per-author, per-piece attribution.
 *
 * Surfaces:
 * - Manual filter: keyword (FTS) + author + topic + content type + date range
 *   + an "include roundups & announcements" toggle, plus article detail.
 *   Author and Topic are first-class facets (unlike OLC).
 * - claude_ama: narrative synthesis across pieces ("what has Lawfare argued
 *   about X"). Same plan + execute pattern OLC uses, with Lawfare-specific
 *   prompts and [lawfare-ref:ARTICLE_ID] citation syntax.
 * - Summarize-one-article: an action on the article detail panel, not a mode.
 *
 * Live counts come from /corpus/lawfare/facets.
 */
export const lawfareSpoke: CorpusSpoke = {
  slug: 'lawfare',
  title: 'Lawfare',
  description:
    "Lawfare's own published analysis — articles, podcasts, and newsletters from lawfaremedia.org.",
  status: 'active',

  plainEnglishDisclosure:
    "Lawfare's own published commentary — articles, podcast episodes, and newsletters. This is analysis, not a primary source: the synthesis reports what Lawfare authors have argued, with per-author and per-piece attribution, and never adjudicates which view is right.",

  getHoldings: async () => {
    try {
      const f = await fetchLawfareFacets()
      const articles =
        f.content_types.find((c) => c.value === 'article')?.count ?? 0
      const podcasts =
        f.content_types.find((c) => c.value === 'podcast')?.count ?? 0
      const newsletters =
        f.content_types.find((c) => c.value === 'newsletter')?.count ?? 0
      return {
        counts: { items: f.document_count },
        coverage: `${f.earliest} → ${f.latest}`,
        lastUpdated: f.latest,
        provenance: {
          articles,
          podcasts,
          newsletters,
        },
        knownGaps: [
          'Commentary, not primary source — pieces reflect their authors’ views, not Lawfare-institutional positions or adjudicated conclusions.',
          'Roundups and announcements are suppressed from results by default; toggle them in to see them.',
        ],
      }
    } catch {
      return {
        counts: { items: 0 },
        coverage: '—',
        lastUpdated: '—',
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
}
