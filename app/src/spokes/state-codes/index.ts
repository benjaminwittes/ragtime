import {
  type CorpusHoldings,
  type CorpusSlug,
  type CorpusSpoke,
  fetchStateCodesFacets,
} from '@lawfare/ragtime-client'
import { STATE_CODES_SLUG } from './state-codes-format'

/**
 * State Codes spoke: the codified law of the states and the District, one
 * member per jurisdiction. The first member is `dc`, the D.C. Code
 * (public.dc_code_sections, 24,270 sections in 54 titles, Title 99 left out;
 * ragtime-pipeline `ingest/dc-code`). Query design: ragtime-dev
 * docs/briefs/dc-code-query-design.md.
 *
 * PROPOSED, NOT YET SERVED. The Worker has a standalone `dc_code` corpus
 * (building; keyword + semantic only, ragtime-worker#286). This spoke is built
 * against the state_codes contract in packages/client (search
 * "/corpus/state_codes/*" in worker-client.ts): facets, filter, section,
 * items-by-ids and the member-scoped semantic slug `state_codes:dc`.
 *
 * Not yet a CorpusSlug: `CorpusSlug` is derived from the generated registry,
 * which lists live corpora only. Until state_codes is registered, live, and
 * `npm run registry:sync` has run, the slug is cast here, and the spoke is
 * not in spokes/registry.ts or App.tsx's shell switch (both are typed by the
 * generated registry and would not compile with it). Remove the cast then.
 *
 * The corpus rules the page keeps (corpus description + query design):
 * - Anything not in force is flagged on every row and in the section sheet,
 *   with a way to leave it out; whenever the page leaves sections out, it
 *   says how many and which statuses.
 * - A recodified or replaced section names, and links to, the section its
 *   rule moved to (recodified_to).
 * - Sections whose current text includes emergency or temporary law are
 *   marked.
 * - The date the law is reflected through (codified_date) is shown.
 * - It reports what the code says. No AI modes, and no legal-advice framing.
 */

const DISCLOSURE =
  'The codified law of the states and the District of Columbia, one jurisdiction at a time. The District of Columbia Code is here now: every section of its 54 titles as the DC Council publishes it, with each section’s status. Sections that are repealed, expired, recodified or otherwise not in force are kept and marked, so you can see them or leave them out.'

const KNOWN_GAPS = [
  'Only the District of Columbia so far. Other states’ codes will be added as members of this corpus',
  'D.C. Code Title 99 is left out: it holds the permanent text of sections whose current text is temporary or emergency law, so loading it would count those sections twice. Those sections are marked “temporary text” instead',
  'The current codification only. Earlier versions of the code, and when each section changed, are not searchable here yet',
  'The DC Municipal Regulations (DCMR), the D.C. Register, Mayor’s Orders, Council committee reports and D.C. Court of Appeals opinions are not in RAGtime',
  'Where the code says a rule moved to federal law, that link is not recorded yet; only moves within the code are linked',
]

export const stateCodesSpoke: CorpusSpoke = {
  // Cast until state_codes is in the generated registry (see above).
  slug: STATE_CODES_SLUG as CorpusSlug,
  title: 'State Codes',
  description:
    'The codified law of the states and the District, section by section, with what is no longer in force marked. The District of Columbia Code first.',
  status: 'active',

  plainEnglishDisclosure: DISCLOSURE,

  getHoldings: async (): Promise<CorpusHoldings> => {
    try {
      const f = await fetchStateCodesFacets()
      const dc = f.members.dc
      return {
        counts: {
          jurisdictions: Object.keys(f.members).length,
          sections: dc?.section_count ?? 0,
          in_force: dc?.in_force_count ?? 0,
        },
        coverage: dc?.codified_date
          ? `District of Columbia · law reflected through ${dc.codified_date}`
          : 'District of Columbia',
        lastUpdated: dc?.build_date ?? dc?.codified_date ?? 'unknown',
        knownGaps: KNOWN_GAPS,
      }
    } catch {
      return {
        counts: { jurisdictions: 1, sections: 24_270 },
        coverage: 'District of Columbia',
        lastUpdated: 'unknown',
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
}
