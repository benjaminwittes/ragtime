import type { CorpusSpoke } from '../types'
import { fetchPresidentialFacets } from '@/lib/worker-client'

/**
 * Presidential Documents spoke (brief #11).
 *
 * The formal signed instruments by which the President directs the
 * executive branch and the public — executive orders, proclamations,
 * memoranda, determinations, notices — via the Federal Register, with the
 * OFR's amendment/revocation graph parsed alongside (presidential_
 * dispositions, promoted to v1 because the brief's question set is
 * status-and-lineage-heavy: "is EO X still in effect", the
 * cross-administration reversal matrix).
 *
 * Surfaces:
 * - Manual filter: type / president / number lookup / agency / date +
 *   FTS, with the keyword/semantic/both toggle from day one (the corpus
 *   arrived fully embedded).
 * - claude_ama: status/lineage + reversal-matrix + trend + narrative
 *   synthesis, with the coverage-asymmetry denominators enforced in the
 *   worker prompts.
 * - Summarize-one-document on the detail sheet (the disposition trail
 *   rides along so status is stated honestly).
 *
 * Counts: 12,654 documents (EOs 5,898 back to 1940; proclamations 4,394;
 * memoranda 803; determinations 790; notices 769). Live counts come from
 * /corpus/presidential/facets.
 */
export const presidentialSpoke: CorpusSpoke = {
  slug: 'presidential',
  title: 'Presidential Documents',
  description:
    'Executive orders, proclamations, memoranda, determinations, and notices — the formal signed instruments of presidential action, with the amendment/revocation graph.',
  status: 'active',

  plainEnglishDisclosure:
    'Federal Register presidential documents: executive orders back to 1940, plus proclamations, memoranda, determinations, and notices from 1994 forward. Pre-1948 executive orders are finding-aid entries (metadata, no text) pending historical backfill.',

  getHoldings: async () => {
    try {
      const f = await fetchPresidentialFacets()
      const eo = f.doc_types.find((t) => t.value === 'executive_order')?.count ?? 0
      const proc = f.doc_types.find((t) => t.value === 'proclamation')?.count ?? 0
      return {
        counts: { documents: f.document_count },
        coverage: `${f.earliest} → ${f.latest}`,
        lastUpdated: f.latest,
        provenance: {
          executive_orders: eo,
          proclamations: proc,
          with_full_text: f.with_text,
        },
        knownGaps: [
          'Executive orders 1940–1947 are metadata-only finding aids — the Federal Register API has no digitized text for them; historical backfill is in progress.',
          'Proclamations, memoranda, determinations, and notices begin in 1993/94 (the API’s coverage floor for those types) — counts for earlier presidents reflect the corpus floor, not history.',
          'Pre-1936 presidential documents are out of corpus (no authoritative complete source exists).',
        ],
      }
    } catch {
      return {
        counts: { documents: 12654 },
        coverage: '1940 → present',
        lastUpdated: '2026-06-12',
        provenance: {
          executive_orders: 5898,
          proclamations: 4394,
          with_full_text: 11186,
        },
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
    'Which executive order forbids assassination, and how does it define the term?',
    'How many of Biden’s executive orders did Trump revoke?',
    'Is EO 12333 still in effect?',
    'Trace presidential action on classified information.',
  ],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
}
