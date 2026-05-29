import type { CorpusSpoke } from '../types'
import { fetchOlcFacets } from '@/lib/worker-client'

/**
 * OLC opinions spoke — v1 alpha (manual filter + opinion detail).
 *
 * Per brief #2 (OLC), the OLC corpus is paradigmatically analytical /
 * narrative — the user asks "what's the OLC position on X?" and the
 * system retrieves + synthesizes from a body of formally-published,
 * often-long opinions. The "Tell me about…" AI flagship surface lands
 * in a follow-up PR.
 *
 * v1 alpha (this PR): keyword + metadata filtering + opinion detail.
 * Axes: title / author substring, FTS, source (DOJ-published vs Knight
 * FOIA), date range, OCR quality.
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
          'AI modes (the "Tell me about…" flagship analytical surface) land in a follow-up PR.',
        ],
      }
    } catch {
      return {
        counts: { opinions: 2145 },
        coverage: '1934 → present',
        lastUpdated: '2026-05-24',
        provenance: { doj_published: 1439, knight_foia: 706 },
      }
    }
  },

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
