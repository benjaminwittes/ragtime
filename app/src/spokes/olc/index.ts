import type { CorpusSpoke } from '../types'

/**
 * OLC opinions spoke (stub — coming-soon at v1).
 *
 * Per brief #2 (OLC), the OLC corpus is paradigmatically analytical/narrative
 * — the user asks "what's the OLC position on X?" and the system retrieves
 * + synthesizes from a body of formally-published, often-long opinions. v1
 * brief calls this the "Tell me about…" surface.
 *
 * Implementation lands in its own PR once the Worker grows /corpus/* support
 * for the olc_opinions table (today /corpus/* is litigation-only). The
 * descriptor here exists so the hub can surface OLC as a card with real
 * holdings counts and the "coming soon" affordance per brief #1.
 *
 * Counts mirror CLAUDE.md as of 2026-05-24 ingest completion:
 *   2,145 total = 1,439 DOJ-published archive + 706 Knight FOIA net-new.
 */
export const olcSpoke: CorpusSpoke = {
  slug: 'olc',
  title: 'OLC opinions',
  description:
    'Department of Justice Office of Legal Counsel published opinions, including FOIA net-new disclosures via the Knight First Amendment Institute.',
  status: 'coming-soon',

  plainEnglishDisclosure:
    'OLC opinions published by DOJ plus net-new releases obtained through the Knight FOIA archive. Coverage extends back to the 1930s.',

  getHoldings: async () => ({
    counts: { opinions: 2145 },
    coverage: '1934 → present',
    lastUpdated: '2026-05-24',
    provenance: { dojPublished: 1439, knightFoia: 706 },
    knownGaps: [
      '~199 Knight FOIA opinions are degraded scans — LLM-assisted text cleanup deferred to a later sprint.',
      'OLC index/catalog documents (the transparency-catalog metadata) deferred.',
    ],
  }),

  queryModes: ['manual_filter', 'claude_sql', 'claude_analysis', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
}
