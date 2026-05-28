import type { CorpusSpoke } from '../types'

/**
 * STUB litigation spoke.
 *
 * Declares the descriptor shape to validate the type system and seed the
 * registry. The actual implementation (UI, query execution, detail panel,
 * AI mode flows) lands in PR 5 per the foundation-work sequence, drawing
 * directly from the existing single-file `index.html` per the brief #6
 * "wholesale port" decision.
 *
 * `getHoldings` currently returns zeros — once the spoke is wired to the
 * Worker's /corpus/* endpoints (or directly to the corpus Supabase project
 * for free-tier reads), it'll hit the corpus_holdings matview added in
 * brief #6 decision 10 and return real counts.
 */
export const litigationSpoke: CorpusSpoke = {
  slug: 'litigation',
  title: 'Federal court litigation',
  description:
    'Federal district court and appellate dockets, with full docket entries and OCR text of attached filings.',
  status: 'coming-soon',

  plainEnglishDisclosure:
    'Federal cases filed since January 20, 2025. Current as of [last_synced_at].',

  getHoldings: async () => ({
    counts: { cases: 0, docketEntries: 0 },
    coverage:
      'Federal district + appellate courts, post-2025-01-20 floor (backward expansion deferred to post-beta)',
    lastUpdated: new Date(0),
    knownGaps: [
      'No coverage pre-2025-01-20 — backward expansion on rainy-day list',
      'FTS over full document text deferred to PR alongside spoke implementation (brief #6 decision 7)',
    ],
  }),

  // Five modes ported wholesale per brief #6 decision 3 — the set has earned
  // its keep through production use; the React port is a re-skin + refactor,
  // not a redesign.
  queryModes: [
    'manual_filter',
    'claude_sql',
    'claude_read',
    'claude_analysis',
    'claude_ama',
  ],

  // Three flagships, symmetric (brief #6 decision 2). Litigation differs
  // from FRUS/OLC (which name one paradigmatic flagship) — the stack-of-
  // operations UX makes the flagships concurrent operations against the
  // current page, not separate surfaces.
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: null,
  },

  // Eight filter axes from brief #6 §2.
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
      id: 'judge',
      label: 'Judge',
      control: 'dropdown',
      optionsSource: 'corpus-query',
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
      id: 'collection',
      label: 'Collection',
      control: 'dropdown',
      optionsSource: 'corpus-query',
    },
    {
      id: 'cause',
      label: 'Cause / NOS',
      control: 'text',
      placeholder: 'e.g. APA, 551, 1983…',
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

  // 2026-05-27 hook: declared but UI is not rendered at v1. Actual
  // implementation post-beta Sprint 1-2.
  moreLikeThis: {
    documentUnit: {
      label: 'case',
      supportsSubDocuments: true, // sub-doc = specific filing within a case
    },
    similarityHints: [
      'more cases with this theory of liability',
      'more cases before this judge',
      'more cases citing this opinion',
      'more cases at this procedural posture',
      'more cases challenging the same EO / agency action',
    ],
    supportsMultiSelect: true,
    permitsCrossCorpusPivot: false, // v1 within-corpus only per 2026-05-27
  },
}
