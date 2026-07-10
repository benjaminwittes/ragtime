import type { CorpusSpoke } from '../types'
import { fetchFrFacets } from '@/lib/worker-client'

/**
 * Federal Register spoke (brief #12).
 *
 * The daily journal of the executive branch — the rules, proposed rules,
 * and notices through which the administrative state actually acts. Rules
 * and proposed rules are complete from 1994 (the FR API's digital floor)
 * to present; notices load in targeted waves, sanctions/designations
 * first (OFAC, State Department designations, USCIS, significant notices).
 *
 * Surfaces:
 * - Manual filter: FTS + type / agency / significant / RIN / CFR title+
 *   part / open-for-comment / publication + effective date ranges, with
 *   the keyword/semantic/both toggle (the corpus is embedded).
 * - claude_ama: plan→execute→synthesize over federal_register_documents —
 *   rescission chains, sanctions programs, comment-window queries, EO-
 *   implementation questions.
 * - Summarize-one-document on the detail sheet.
 *
 * Counts: ~512,000 documents as of 2026-07-10 (rules ~118.7k; proposed
 * rules ~76.3k; notices ~317k with the broad sweep still harvesting).
 * Live counts come from /corpus/fr/facets.
 */
export const frSpoke: CorpusSpoke = {
  slug: 'fr',
  title: 'Federal Register',
  description:
    'Rules, proposed rules, and notices of the administrative state — the executive branch’s daily journal, 1994 to present.',
  status: 'active',

  plainEnglishDisclosure:
    'The Federal Register is the daily journal of the executive branch — rules, proposed rules, and notices. Rules and proposed rules are complete from 1994 to present; notices are loading in waves — sanctions and designations landed first, and the broad historical sweep is in progress.',

  getHoldings: async () => {
    try {
      const f = await fetchFrFacets()
      const byType = (v: string) =>
        f.doc_types.find((t) => t.value === v)?.count ?? 0
      return {
        counts: { documents: f.document_count },
        coverage: `${f.earliest} → ${f.latest}`,
        lastUpdated: f.latest,
        provenance: {
          rules: byType('rule'),
          proposed_rules: byType('proposed_rule'),
          notices: byType('notice'),
        },
        knownGaps: [
          'Notices are partial: the broad historical sweep is loading now (sanctions, designations, USCIS, and significant notices landed first); newly loaded notices become semantically searchable as the embedding queue catches up',
          'Pre-1994 documents are outside the corpus (FR API digital floor)',
        ],
      }
    } catch {
      return {
        counts: { documents: 512194 },
        coverage: '1994-01-03 → present',
        lastUpdated: '2026-07-10',
        provenance: {
          rules: 118669,
          proposed_rules: 76298,
          notices: 317227,
        },
        knownGaps: [
          'Notices are partial: the broad historical sweep is loading now (sanctions, designations, USCIS, and significant notices landed first); newly loaded notices become semantically searchable as the embedding queue catches up',
          'Pre-1994 documents are outside the corpus (FR API digital floor)',
        ],
      }
    }
  },

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  suggestionChips: [
    'What Biden-era gun regulations were rescinded by the Trump administration?',
    'Show me all sanctions notices emanating from the Ukraine war.',
    'What is open for public comment at EPA right now?',
    'Which rules implement Executive Order 14024?',
  ],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'document' },
    similarityHints: [
      'the same regulatory program or RIN',
      'actions by the same agency',
      'rulemaking from the same era',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
