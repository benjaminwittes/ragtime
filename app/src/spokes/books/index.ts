import { type CorpusSpoke, fetchBooksFacets } from '@lawfare/ragtime-client'

/**
 * Book catalogue spoke — the Library of Congress bibliographic catalogue.
 *
 * Backend: ragtime-worker#145 (`/corpus/books/{filter,facets,record,items-by-ids}`)
 * over `public.loc_bibliography`, 10,543,015 records from LC's *Books All*
 * bulk MARC (ragtime-pipeline#102). Design: ragtime-dev
 * `docs/briefs/book-corpus-query-architecture.md`, ratified 2026-09-22.
 *
 * WHAT THIS SPOKE IS NOT, and every surface in it says so: a corpus of books.
 * It is a catalogue — who made a book, when, how long it is, what the Library
 * says it is about. No text, no page images, no tables of contents. So:
 * - manual_filter only. No AI modes (the books planner is not built, and one
 *   would characterise books from snippets, which P4 forbids), no semantic
 *   pane (nothing is embedded, ragtime-dev#203), no more-like-this.
 * - Not in the hub's keyword fan, mirroring the Worker: a catalogue record
 *   among document hits reads like something we hold and can quote.
 * - Every record ends in the handoff ladder (P3): the LOC entry, free full
 *   text where likely public domain, a library — and Google Books beside it,
 *   labelled as someone else's index.
 */
export const booksSpoke: CorpusSpoke = {
  slug: 'books',
  title: 'Library of Congress catalogue',
  description:
    'The Library of Congress catalogue: ten million books, who wrote them and what they are about — records, not text.',
  status: 'active',

  plainEnglishDisclosure:
    'Catalogue records for 10.5 million books from the Library of Congress — author, title, publisher, date, length and subject headings. We hold the catalogue, not the books: there is no text to search or quote. The records are LC’s 2016 bulk snapshot, so nothing catalogued since 2016 is here, and the snapshot is incomplete even for the years it covers.',

  getHoldings: async () => {
    const knownGaps = [
      'Records, not text: no full text, page images or tables of contents',
      'A 2016 snapshot — nothing the Library catalogued after 2016',
      'Incomplete inside its own window: LC’s live catalogue holds records this snapshot does not',
      'No quality signal — no citations, reviews or circulation; it says what the Library catalogues as being about a subject, not what is best',
    ]
    try {
      const f = await fetchBooksFacets()
      return {
        counts: { records: f.record_count },
        coverage:
          f.pub_year_min != null && f.pub_year_max != null
            ? `Published ${f.pub_year_min} → ${f.pub_year_max} · catalogue snapshot ${f.source_vintage ?? 2016}`
            : `Catalogue snapshot ${f.source_vintage ?? 2016}`,
        lastUpdated: String(f.source_vintage ?? 2016),
        knownGaps,
      }
    } catch {
      return {
        counts: { records: 10543015 },
        coverage: 'Catalogue snapshot 2016',
        lastUpdated: '2016',
        knownGaps,
      }
    }
  },

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering'],
    paradigmatic: 'filtering',
  },
  facets: [],
  defaultSearchDepth: 'docket-only',
}
