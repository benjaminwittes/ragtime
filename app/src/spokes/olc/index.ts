import type { CorpusSpoke } from '../types'
import { fetchOlcFacets } from '@/lib/worker-client'

/**
 * OLC opinions spoke.
 *
 * Per brief #2 (OLC), the OLC corpus is paradigmatically analytical /
 * narrative — the user asks "what's the OLC position on X?" and the
 * system retrieves + synthesizes from a body of formally-published,
 * often-long opinions.
 *
 * Surfaces:
 * - Manual filter: keyword + metadata filtering + opinion detail.
 *   Axes: title / author substring, FTS, source (DOJ-published vs Knight
 *   FOIA), date range, OCR quality.
 * - claude_ama (PR 4q): the brief's flagship — narrative synthesis across
 *   opinions ("what has OLC said about X across administrations"). Uses
 *   the same plan + execute pattern litigation does, with OLC-specific
 *   prompts and [olc-ref:OPINION_ID] citation syntax.
 * - Summarize-one-opinion (PR 4q): brief #2 §3's "plus" — an action on
 *   the opinion detail panel, not a mode in the selector.
 *
 * Counts: 2,145 total = 1,439 DOJ-published archive + 706 Knight FOIA
 * net-new. Per-section live counts come from /corpus/olc/facets.
 */
export const olcSpoke: CorpusSpoke = {
  slug: 'olc',
  title: 'OLC opinions',
  description:
    'Department of Justice Office of Legal Counsel published opinions, including FOIA net-new disclosures via the Knight First Amendment Institute.',
  status: 'active',

  plainEnglishDisclosure:
    'OLC opinions published by DOJ plus net-new releases obtained through the Knight FOIA archive. Coverage extends back to the 1930s.',

  getHoldings: async () => {
    try {
      const f = await fetchOlcFacets()
      const doj =
        f.sources.find((s) => s.value === 'doj-published')?.count ?? 0
      const knight =
        f.sources.find((s) => s.value === 'knight-foia')?.count ?? 0
      return {
        counts: { opinions: f.opinion_count },
        coverage: `${f.earliest} → ${f.latest}`,
        lastUpdated: f.latest,
        provenance: {
          doj_published: doj,
          knight_foia: knight,
        },
        knownGaps: [
          '~199 Knight FOIA opinions are degraded scans — LLM-assisted text cleanup deferred to a later sprint.',
          'OLC index/catalog documents (the transparency-catalog metadata) deferred.',
          'Author, recipient, and president are not yet populated on the metadata — surfaced only where the opinion text itself names them.',
        ],
      }
    } catch {
      return {
        counts: { opinions: 2147 },
        coverage: '1934 → present',
        lastUpdated: '2026-06-10',
        provenance: { doj_published: 1441, knight_foia: 706 },
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
    documentUnit: { label: 'opinion' },
    // Pre-fill chips for the "in what way?" prompt. Free-form input always
    // wins; these are corpus-shaped starting points (an "overall similarity"
    // chip is added by the prompt UI itself → route:"meaning").
    similarityHints: [
      'the same legal question',
      'the constitutional authority it relies on',
      'opinions reaching the opposite conclusion',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
