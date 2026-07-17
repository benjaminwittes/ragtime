import type { CorpusSpoke } from '../types'
import {
  fetchSanctionsEntityFacets,
  fetchSanctionsGuidanceFacets,
  fetchSanctionsFrFacets,
} from '@/lib/worker-client'

/**
 * Sanctions spoke (brief #15) — the FIRST CROSS-CORPUS SPOKE.
 *
 * Three data legs behind one workspace:
 *  1. The ENTITY PANE (the marquee, locked decision #2): OFAC's SDN +
 *     consolidated lists (~19.6K entries), alias-aware name search, entity
 *     cards, program/list/type facets — with the pinned screening candor
 *     note VISIBLE on the pane: this is a research tool, not a compliance
 *     screening tool; OFAC's official Sanctions List Search is
 *     authoritative, and our copy lags it (the live data-as-of date shows).
 *  2. DOCUMENTS: OFAC-published guidance (FAQs, enforcement actions,
 *     general licenses — 1,475 docs, 31 undated) + the Federal Register
 *     sanctions slice (~4.2K docs, queried live in the fr corpus — no
 *     duplication; detail views go through the FR document endpoint).
 *  3. AMA with a 3-branch router: entity SQL lookups, prose RAG over
 *     guidance + the FR slice, and count/aggregate questions. Router
 *     failure degrades to prose.
 *
 * The corpus quirk that shapes the entity leg: NO DESIGNATION DATES.
 * publish_date is the copy's freshness stamp (one value corpus-wide), not a
 * per-entity fact — "since when has X been sanctioned" is answered from FR
 * designation notices, never from the entity table. And the lists are
 * CURRENT-ONLY: delisted entities vanish, so absence is never clearance.
 */
export const sanctionsSpoke: CorpusSpoke = {
  slug: 'sanctions',
  title: 'Sanctions',
  description:
    'OFAC’s sanctions lists (SDN + consolidated, ~19,600 entries), OFAC-published guidance, and Federal Register sanctions actions — one research workspace.',
  status: 'active',

  plainEnglishDisclosure:
    'OFAC’s sanctions lists as we mirror them — every current SDN and consolidated-list entry, with aliases, programs, and executive orders — plus OFAC’s published guidance and the Federal Register’s sanctions actions. A research tool, not a compliance screening tool: OFAC’s official Sanctions List Search is authoritative, and this copy lags it.',

  getHoldings: async () => {
    const knownGaps = [
      'Not a screening tool: OFAC’s official Sanctions List Search (sanctionssearch.ofac.treas.gov) is the authoritative source; this copy lags OFAC’s publication',
      'Current lists only — delisted entities vanish from the lists, so absence here is never evidence an entity was never sanctioned',
      'No designation dates on the entity list (the publish date is our copy’s freshness stamp) — “since when” lives in the Federal Register designation notices',
      'Guidance covers OFAC-published documents (FAQs, enforcement actions, general licenses), not the sanctions regulations themselves — 31 CFR chapter V lives in the CFR corpus; 31 guidance documents carry no issue date',
      'The Federal Register slice is a curated sanctions subset; pre-1994 Federal Register documents are absent',
    ]
    try {
      const [entities, guidance, fr] = await Promise.all([
        fetchSanctionsEntityFacets(),
        fetchSanctionsGuidanceFacets(),
        fetchSanctionsFrFacets(),
      ])
      return {
        counts: {
          entities: entities.entity_count,
          'guidance docs': guidance.document_count,
          'FR sanctions docs': fr.document_count,
        },
        coverage: `Current SDN + consolidated lists · list data as of ${entities.data_as_of ?? 'unknown'}`,
        lastUpdated: entities.data_as_of ?? '—',
        knownGaps,
      }
    } catch {
      return {
        counts: {
          entities: 19571,
          'guidance docs': 1475,
          'FR sanctions docs': 4215,
        },
        coverage: 'Current SDN + consolidated lists (nightly sync)',
        lastUpdated: '—',
        knownGaps,
      }
    }
  },

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'retrieval',
  },
  facets: [],
  // Marquee chips (locked decision #4 — subjects fixed: an is-X-sanctioned
  // entity demo, the 50% rule, Russia/EO 14024, FTO designations; wording
  // drafted here). Each targets a different router branch: #1 entity,
  // #2 prose, #3 count, #4 prose over the FR slice.
  suggestionChips: [
    'Is the Wagner Group sanctioned — and under which programs and executive orders?',
    'What does OFAC’s 50 percent rule mean for companies owned by sanctioned people?',
    'How many entities are sanctioned under EO 14024, the Russia authority?',
    'How does a group get designated a Foreign Terrorist Organization?',
  ],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'document' },
    similarityHints: [
      'the same sanctions program or authority',
      'similar guidance — licenses, FAQs, enforcement',
      'the same country or sector',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
