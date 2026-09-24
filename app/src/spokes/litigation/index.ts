import { type CorpusSpoke, fetchCorpusFacets } from '@lawfare/ragtime-client'

/**
 * Litigation spoke.
 *
 * Declares the descriptor for the litigation surface. The rendering layer
 * (header band, filter form, results list, etc.) is the generic spoke
 * renderer in ../SpokeShell.tsx; the descriptor here drives what it shows.
 *
 * `getHoldings` calls the Worker's /corpus/facets endpoint — which the
 * filter form also consumes — and reshapes its response into the
 * descriptor's CorpusHoldings type.
 *
 * Served live from CourtListener's REST API (federate-api, settled
 * 2026-08-16, ragtime-evals#176). There is no hosted mirror, so the modes and
 * affordances that ran SQL or embeddings over it are retired for this corpus:
 * AI-writes-SQL, AMA (NL→SQL plan/execute) and more-like-this. The Worker
 * answers them 410 retired_federated; the descriptor stops offering them.
 */
export const litigationSpoke: CorpusSpoke = {
  slug: 'litigation',
  title: 'Federal court litigation',
  description:
    'Federal dockets, district and appellate, since the start of 2025, and the filings on each.',
  status: 'active',

  plainEnglishDisclosure:
    'Searched live on CourtListener (RECAP), at any filing date. An empty result means CourtListener holds nothing that matches, not that nothing was filed.',

  getHoldings: async () => {
    const f = await fetchCorpusFacets()
    const counts: Record<string, number> = {}
    if (f.case_count != null) counts.cases = f.case_count
    if (f.entry_count != null) counts.docketEntries = f.entry_count
    return {
      counts,
      coverage:
        'Federal district + appellate courts, all dates — whatever RECAP holds.',
      // Null for a live corpus: reads go upstream, there is nothing to sync.
      lastUpdated: f.last_synced ?? 'live',
      knownGaps: [
        'RECAP holds only the dockets and filings someone has bought from PACER, so coverage is uneven by court and by case.',
        'Keyword search only — no semantic search or more-like-this over CourtListener.',
      ],
    }
  },

  // Brief #6 decision 3 ported five modes. Two ran SQL over the retired
  // mirror and are gone for litigation: claude_sql and claude_ama.
  queryModes: ['manual_filter', 'claude_read', 'claude_analysis'],

  // Three flagships, symmetric (brief #6 decision 2). Litigation differs
  // from FRUS/OLC (which name one paradigmatic flagship) — the stack-of-
  // operations UX makes the flagships concurrent operations against the
  // current page, not separate surfaces.
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },

  // Brief #6 §2's eight filter axes. `collection` is the project's own
  // curation: the Worker keeps each collection's docket list and resolves the
  // slug to it, then searches CourtListener for those dockets.
  facets: [
    {
      id: 'fts',
      label: 'Full-text search',
      control: 'fts',
      placeholder: 'e.g. preliminary injunction, TRO…',
    },
    {
      id: 'case_name',
      label: 'Case name',
      control: 'text',
      placeholder: 'e.g. ACLU, Trump, EPA…',
    },
    {
      id: 'courts',
      label: 'Courts',
      control: 'multi-select',
      optionsSource: 'corpus-query',
    },
    {
      // CourtListener has no judge pick-list for dockets; the filter matches
      // a judge by name. FilterForm renders a text input when the facet list
      // arrives empty.
      id: 'judge',
      label: 'Judge',
      control: 'dropdown',
      optionsSource: 'corpus-query',
      placeholder: 'e.g. Boasberg',
    },
    {
      id: 'case_type',
      label: 'Case type',
      control: 'dropdown',
      staticOptions: [
        { value: 'cv', label: 'Civil' },
        { value: 'cr', label: 'Criminal' },
        { value: 'mj', label: 'Magistrate' },
        { value: 'mc', label: 'Misc' },
      ],
    },
    {
      id: 'cause',
      label: 'Cause / NOS',
      control: 'text',
      placeholder: 'e.g. APA, 551, 1983…',
    },
    {
      id: 'collection',
      label: 'Collection',
      control: 'dropdown',
      optionsSource: 'corpus-query',
    },
    {
      id: 'date_range',
      label: 'Date range',
      control: 'date-range',
    },
  ],

  // Litigation's "scopes-library equivalent" is the court presets (per brief
  // #6 §2). Other named scopes (e.g., "Immigration TROs", "EO challenges")
  // are rainy-day per brief #6 decision 6.
  scopes: [
    {
      id: 'all-courts',
      label: 'All courts',
      filter: { courts: '*' },
      source: 'derived',
    },
    {
      id: 'district-only',
      label: 'District courts only',
      filter: { courts: 'district' },
      source: 'derived',
    },
    {
      id: 'circuit-only',
      label: 'Circuit courts only',
      filter: { courts: 'circuit' },
      source: 'derived',
    },
  ],

  // Demo-ready exemplars from brief #6 §1 — the placeholder set, pending the
  // litigation query-refinement series.
  suggestionChips: [
    "What's the administration's win rate in immigration cases?",
    'Show me cases challenging the birthright-citizenship EO.',
    'Which judges have ruled against TRO motions most often?',
    'Pull all cases where the government has been sanctioned in 2025.',
    'Cases involving DOGE.',
  ],

  // Brief #6 decision 8: docket-only default for litigation main surface.
  // Collections (brief #7 decision 8) flip this to 'full-doc'.
  defaultSearchDepth: 'docket-only',

  // No `moreLikeThis`: the digest embeddings it pivoted on have no
  // CourtListener equivalent, and RECAP is keyword-only.
}
