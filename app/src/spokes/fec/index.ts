import {
  type CorpusHoldings,
  type CorpusSpoke,
  fetchFecFacets,
} from '@lawfare/ragtime-client'
import { FEC_SLUG } from './fec-format'

/**
 * Federal Election Commission spoke ("FEC"), shown on the hub under the
 * shared "Elections" heading (hub group `elections`) after the EAC.
 *
 * Backend: `/corpus/fec/{filter,facets,candidate,committee,items-by-ids}`
 * (contract v1, 2026-11-16; benjaminwittes/ragtime-pipeline#147), over the
 * FEC bulk summary files: fec_candidates (cn), fec_committees (cm),
 * fec_linkages (ccl), fec_candidate_totals (webl, weball),
 * fec_candidate_summary (candidate_summary) and fec_pac_party_totals (webk).
 * Schema: ragtime-pipeline `ingest/fec/schema.sql`. Query design: ragtime-dev
 * docs/briefs/fec-query-design.md.
 *
 * Live since 2026-11-17 (ragtime-pipeline#148, ragtime-worker#289).
 *
 * The rules the page keeps (see fec-format.ts): exact amounts, never computed;
 * FEC variable names beside every figure; every figure linked to its source
 * file and line; cycles said as "2022 cycle (2021–2022)"; candidate IDs, not
 * candidates; codes visible beside any plain label; nothing merged.
 */

const DISCLOSURE =
  'The Federal Election Commission’s bulk summary files: every candidate ID and committee ID the FEC lists, cycle by cycle, with how they are linked and the FEC’s own summary totals for each. Figures are shown exactly as the FEC publishes them, with the FEC’s field names, and each links to the FEC file and line it came from. Nothing is added up, compared or merged here.'

const KNOWN_GAPS = [
  'Summary files only. Itemized receipts and disbursements, contributor records and independent-expenditure records are not here yet',
  'Figures are two-year cycle totals and cannot be cut to a single calendar year',
  'Counts are of candidate IDs, not people: a person who ran for different offices has several candidate IDs, and they are not merged',
  'The candidate-committee linkage file starts with the 2000 cycle, and the FEC’s 50-field candidate summary with the 2008 cycle',
  'Filings (Form 3, Form 3X and the rest) are not loaded yet',
]

export const fecSpoke: CorpusSpoke = {
  slug: FEC_SLUG,
  title: 'Federal Election Commission',
  description:
    'FEC candidate IDs and committees, cycle by cycle: who is linked to whom, and the FEC’s own summary totals, exactly as published.',
  status: 'active',

  plainEnglishDisclosure: DISCLOSURE,

  getHoldings: async (): Promise<CorpusHoldings> => {
    try {
      const [c, m] = await Promise.all([
        fetchFecFacets({ kind: 'candidate' }),
        fetchFecFacets({ kind: 'committee' }),
      ])
      return {
        counts: { candidate_ids: Number(c.total), committee_ids: Number(m.total) },
        coverage: 'FEC bulk summary files, two-year cycles',
        lastUpdated: 'unknown',
        knownGaps: KNOWN_GAPS,
      }
    } catch {
      return {
        counts: {},
        coverage: 'FEC bulk summary files, two-year cycles',
        lastUpdated: 'unknown',
        knownGaps: KNOWN_GAPS,
      }
    }
  },

  queryModes: ['manual_filter'],
  flagships: {
    present: ['filtering'],
    paradigmatic: null,
  },
  facets: [],
  defaultSearchDepth: 'full-doc',
  semanticSearch: false,
}
