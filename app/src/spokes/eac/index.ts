import { type CorpusHoldings, type CorpusSpoke, fetchEacFacets } from '@lawfare/ragtime-client'

/**
 * U.S. Election Assistance Commission spoke.
 *
 * Backend: ragtime-worker#279 (`/corpus/eac/{filter,facets,document,items-by-ids}`)
 * over `public.eac_documents` — every document file eac.gov listed in its media
 * index on 2026-10-13, except duplicates, webform uploads and images or video
 * (ragtime-pipeline `ingest/eac`). Catalogue entry: `eac.json`.
 *
 * The corpus quirk that shapes everything: DISPLAY TIERS. Each document is
 * either `full` (works by the EAC and other federal agencies) or `link_only`
 * (states, test labs, manufacturers, commenters and other outside authors).
 * A link-only document is searchable, but the Worker returns only its title,
 * date, author group and link — never its text or a snippet. The Worker
 * enforces this (worker/display.js); every surface here also treats any row
 * that does not say `display: 'full'` as link-only, so the UI can only ever
 * show less, never more.
 *
 * - manual_filter only. No AI modes: hub_ama, plan_execute and summarize are
 *   off for EAC in the catalogue, so no model is asked to read EAC text. The
 *   EAC query design (ragtime-dev docs/briefs/eac-query-design.md) needs the
 *   EAVS structured tables first.
 * - Semantic search and more-like-this are live (195,207 chunks under corpus
 *   'eac'); the Worker drops snippets for link-only results.
 */

const DISCLOSURE =
  'The documents the U.S. Election Assistance Commission publishes on eac.gov: its reports, guidance, meeting records, grant materials, EAVS releases and files on voting-system testing and certification. Works by the EAC and other federal agencies are shown in full. Documents by states, test labs, manufacturers, commenters and other outside authors are searchable but shown only as a title, date, author group and link to eac.gov.'

const KNOWN_GAPS = [
  'A snapshot: what eac.gov’s media index listed on 2026-10-13. Documents posted since then are not here yet',
  'Link-only documents: work by outside authors (states, test labs, manufacturers, commenters and others) is matched by search but shown only as a title, date, author group and link — open it on eac.gov to read it',
  'Duplicates, webform uploads, images and video are left out',
  'Some files could not be read (damaged PDFs and some data files); they can be found by title, but their text is not searchable',
  'The EAVS survey data is here as published files, not as tables you can query by state or year',
]

export const eacSpoke: CorpusSpoke = {
  slug: 'eac',
  title: 'U.S. Election Assistance Commission',
  description:
    'What the EAC publishes on eac.gov: reports, guidance, meeting records, EAVS releases and files on voting-system testing.',
  status: 'active',

  plainEnglishDisclosure: DISCLOSURE,

  getHoldings: async (): Promise<CorpusHoldings> => {
    try {
      const f = await fetchEacFacets()
      return {
        counts: {
          documents: Number(f.document_count),
          shown_in_full: Number(f.shown_in_full),
          link_only: Number(f.link_only),
        },
        coverage:
          f.earliest && f.latest
            ? `Posted ${f.earliest} → ${f.latest} · eac.gov snapshot of 2026-10-13`
            : 'eac.gov snapshot of 2026-10-13',
        lastUpdated: '2026-10-13',
        knownGaps: KNOWN_GAPS,
      }
    } catch {
      return {
        counts: { documents: 9200, shown_in_full: 3649, link_only: 5551 },
        coverage: 'eac.gov snapshot of 2026-10-13',
        lastUpdated: '2026-10-13',
        knownGaps: KNOWN_GAPS,
      }
    }
  },

  queryModes: ['manual_filter'],
  flagships: {
    present: ['retrieval', 'filtering'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'document' },
    similarityHints: [
      'the same voting system or test campaign',
      'the same meeting, board or hearing',
      'similar guidance to election officials',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
