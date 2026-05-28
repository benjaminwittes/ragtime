import type { CorpusSpoke } from '../types'
import { fetchCorpusFacets } from '@/lib/worker-client'

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
 */
export const litigationSpoke: CorpusSpoke = {
  slug: 'litigation',
  title: 'Federal court litigation',
  description:
    'Federal district court and appellate dockets, with full docket entries and OCR text of attached filings.',
  status: 'active',

  plainEnglishDisclosure:
    'Federal cases filed since January 20, 2025. Current as of [last_synced_at].',

  getHoldings: async () => {
    const f = await fetchCorpusFacets()
    return {
      counts: { cases: f.case_count, docketEntries: f.entry_count },
      coverage:
        'Federal district + appellate courts, post-2025-01-20 floor (backward expansion deferred to post-beta).',
      // `last_synced` is YYYY-MM-DD from the Worker; preserved as string so
      // formatters can choose how to render. CorpusHoldings allows Date|string.
      lastUpdated: f.last_synced,
      knownGaps: [
        'No coverage pre-2025-01-20 — backward expansion on rainy-day list.',
        'FTS runs over docket-entry descriptions today; full-document FTS lands when the documents.text_content column is populated by the ragtime-pipeline backfill (harvest-pcg agent) and indexed (brief #6 decision 7).',
      ],
    }
  },

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
