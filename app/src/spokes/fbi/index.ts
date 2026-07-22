import type { CorpusSpoke } from '../types'
import { fetchFbiFacets } from '@/lib/worker-client'

/**
 * FBI Records spoke (brief #14).
 *
 * The FBI's own FOIA reading room — the Vault (vault.fbi.gov) — as this
 * project preserved it: 10,746 released documents across 1,755 subject
 * collections (COINTELPRO, the Rosenberg case, Amerithrax, Jonestown, and
 * 1,751 others), including 1,627 documents that were REMOVED from the Vault
 * and recovered from Wayback Machine captures.
 *
 * Four locked decisions (Ben, 7/17) shape the spoke:
 * 1. Provenance = facet + badge, NOT marquee — recovered docs are filterable
 *    and quietly badged with their Wayback capture date; no front-door chip.
 * 2. Collections = facet + typeahead only — no browse-index page, no curated
 *    shelf (the "no query-architecture buttons" principle).
 * 3. Name: "FBI Records" (not "FBI Vault") — leaves room for non-Vault FBI
 *    material later.
 * 4. Marquee chips: 9/11 investigation · COINTELPRO · Rosenberg case ·
 *    Amerithrax (wording below).
 *
 * The corpus quirk that shapes everything: NO DATE AXIS. doc_date is NULL on
 * every row — the Vault publishes scans without dates. No date filter, no
 * date sort, anywhere; where other spokes show a date, this one shows the
 * collection. The AMA planner carries explicit no-date candor ("documents
 * ABOUT 1965" is answerable by content; "documents FROM 1965" is not a
 * filterable question).
 *
 * Fully embedded (1.3M chunks, corpus 'fbi') — the semantic pane is live
 * from day one.
 */
export const fbiSpoke: CorpusSpoke = {
  slug: 'fbi',
  title: 'FBI Records',
  description:
    'The FBI’s FOIA reading room (the Vault) as preserved — 10,700+ released files across 1,755 subjects, including documents since removed from the Vault.',
  status: 'active',

  plainEnglishDisclosure:
    'The FBI’s own FOIA reading room — the Vault — as we preserved it, including 1,627 documents the Bureau has since removed (recovered from Wayback Machine captures). These are OCR’d scans of historical investigative records with NO document dates; coverage is what the FBI chose to post, not all FBI records and not current investigations.',

  getHoldings: async () => {
    const knownGaps = [
      'No document dates: the Vault publishes scans without dates, so there is no date filter or date sort anywhere in this spoke — search by content or collection instead',
      'Coverage is the Vault as preserved — the FBI’s chosen FOIA postings, not all FBI records; absence here is not evidence the FBI holds nothing',
      'OCR quality varies (about 4,200 documents are flagged degraded) — verbatim wording may contain recognition errors',
    ]
    try {
      const f = await fetchFbiFacets()
      const live = f.provenance.find((p) => p.value === 'live')?.count ?? 0
      const recovered =
        f.provenance.find((p) => p.value === 'wayback-recovered')?.count ?? 0
      return {
        counts: { documents: f.document_count },
        coverage: `${f.collection_count.toLocaleString()} Vault subject collections — no document dates`,
        lastUpdated: '2026-07-15',
        provenance: {
          live_on_the_vault: live,
          removed_recovered_from_wayback: recovered,
        },
        knownGaps,
      }
    } catch {
      return {
        counts: { documents: 10746 },
        coverage: '1,755 Vault subject collections — no document dates',
        lastUpdated: '2026-07-15',
        provenance: {
          live_on_the_vault: 9119,
          removed_recovered_from_wayback: 1627,
        },
        knownGaps,
      }
    }
  },

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  // Marquee chips (locked decision #4 — subjects fixed; wording drafted at
  // frontend build). Question-shaped, and none of them date-shaped: the
  // corpus has no dates to promise.
  suggestionChips: [
    'What do the FBI’s files show about the 9/11 investigation?',
    'What was COINTELPRO, according to the Bureau’s own records?',
    'What’s in the FBI’s file on the Rosenberg case?',
    'How did the FBI investigate the anthrax letters (Amerithrax)?',
  ],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'document' },
    similarityHints: [
      'the same investigation or subject',
      'files from the same collection',
      'similar Bureau paperwork — memos, teletypes, lab reports',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
