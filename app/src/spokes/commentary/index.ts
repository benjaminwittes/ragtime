import type { CorpusSpoke } from '../types'
import { fetchCommentaryFacets } from '@/lib/worker-client'

/**
 * Commentary spoke.
 *
 * The platform's COMMENTARY corpus — federating TWO publications under one
 * spoke: Lawfare (its own articles, podcasts, and newsletters from
 * lawfaremedia.org) and Executive Functions (the Bob Bauer + Jack Goldsmith
 * publication on the presidency). REPLACES the standalone Lawfare spoke;
 * Lawfare is now a Publication filter value.
 *
 * Unlike the primary-source corpora (litigation, OLC, USC, CFR, FRUS), this is
 * commentary. The synthesis attributes views to authors + pieces + PUBLICATION;
 * it surfaces what authors said, never adjudicates which view is right.
 *
 * Paradigmatically analytical/narrative, like OLC: the user asks "what has been
 * written/argued about X?" and the system retrieves + synthesizes across BOTH
 * publications, with per-author, per-piece, per-publication attribution.
 *
 * Surfaces:
 * - Manual filter: keyword (FTS) + publication + author (name) + content type +
 *   date range, plus a piece reader detail. (No topic / roundup controls —
 *   commentary has neither field as a first-class filter across publications.)
 * - claude_ama: narrative synthesis across pieces ("what has been argued about
 *   X"). Same plan + execute pattern Lawfare uses, with a two-publication
 *   citation idiom ({publication, id}).
 * - Summarize-one-document: an action on the piece detail panel, not a mode.
 *
 * Holdings aggregate across publications: facets return per-publication counts
 * (no top-level total), so `getHoldings` sums them and spans the coverage
 * window across both.
 */
export const commentarySpoke: CorpusSpoke = {
  slug: 'commentary',
  title: 'Commentary',
  description:
    'Expert legal/national-security commentary — Lawfare and Executive Functions, federated under one spoke.',
  status: 'active',

  plainEnglishDisclosure:
    'Expert legal and national-security commentary from two publications — Lawfare (articles, podcasts, newsletters) and Executive Functions (Bob Bauer + Jack Goldsmith on the presidency). This is analysis, not a primary source: the synthesis reports what authors have argued, with per-author, per-piece, and per-publication attribution, and never adjudicates which view is right.',

  getHoldings: async () => {
    try {
      const f = await fetchCommentaryFacets()
      const pubs = Object.values(f.publications)
      const items = pubs.reduce((sum, p) => sum + (p.count ?? 0), 0)
      const earliests = pubs
        .map((p) => p.earliest)
        .filter((d): d is string => !!d)
        .sort()
      const latests = pubs
        .map((p) => p.latest)
        .filter((d): d is string => !!d)
        .sort()
      const earliest = earliests[0]
      const latest = latests[latests.length - 1]
      const lawfare = f.publications.lawfare?.count ?? 0
      const executive_functions =
        f.publications.executive_functions?.count ?? 0
      return {
        counts: { items },
        coverage:
          earliest && latest ? `${earliest} → ${latest}` : '—',
        lastUpdated: latest ?? '—',
        provenance: {
          lawfare,
          executive_functions,
        },
        knownGaps: [
          'Commentary, not primary source — both publications are analysis; pieces reflect their authors’ views, not adjudicated conclusions.',
          'Executive Functions launched December 2024 and is a small, young corpus (~540 pieces) with a narrow founding focus (the presidency / executive power). Its silence on earlier events means the publication did not yet exist.',
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
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'piece' },
    similarityHints: [
      'the same legal question',
      'the same controversy or case',
      'pieces taking a different view',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
