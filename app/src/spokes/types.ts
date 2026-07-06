/**
 * Per-corpus capability descriptor types.
 *
 * Every corpus spoke (litigation, OLC, USC, CFR, FRUS, plus collection
 * sub-spokes per brief #7) implements `CorpusSpoke`. The generic spoke
 * renderer reads this descriptor to drive UI, query modes, facets,
 * holdings disclosure, "more like this" affordances, etc.
 *
 * Design rationale: see ./SPEC.md.
 *
 * Cross-references to the strategic briefs:
 * - brief #1 (hub) — router, dual output, free-tier floor
 * - brief #6 (litigation) — decisions 1, 8, 9a, 9b, plus the five query modes
 * - brief #7 (collections) — decisions 2, 5, 6, 7, 8, 9, 12, 13
 * - 2026-05-27 "more like this" hook decision
 */

/** Slugs of all loaded corpora. New corpora extend this union. */
export type CorpusSlug =
  | 'litigation'
  | 'olc'
  | 'usc'
  | 'cfr'
  | 'frus'
  | 'lawfare'
  | 'presidential'
  | 'fr'

/**
 * A spoke's lifecycle status. Drives whether it shows up in nav and how
 * it surfaces on the hub.
 */
export type SpokeStatus = 'active' | 'coming-soon' | 'archived'

/**
 * Reference to the smallest selectable unit within a corpus — the "document"
 * for purposes of the "more like this" feature (per 2026-05-27 decision) and
 * the case/doc-detail panels. For litigation this is a case (with optional
 * sub-document path for a specific filing within); for other corpora it's
 * the natural unit (opinion, section, document).
 */
export type DocumentRef = {
  corpus: CorpusSlug
  id: string
  /** Optional sub-document path (e.g., for litigation: a specific docket
   * entry or attached document within a case). Undefined = the unit itself. */
  subPath?: string
}

/**
 * Corpus-holdings data surfaced in the spoke header band. Brief #6 decision
 * 9a established this as a cross-cutting principle: every spoke shows total
 * count(s), coverage window, last-updated, provenance splits where meaningful,
 * known gaps.
 *
 * Async because some counts may come from Worker /corpus/* queries that need
 * to hit Postgres; static values can be returned synchronously inside a
 * resolved Promise.
 */
export type CorpusHoldings = {
  /** Top-line counts, keyed by what's being counted (corpus-specific labels).
   * Examples: {cases: 1_094_000, docketEntries: 6_750_000} for litigation;
   * {opinions: 2_145} for OLC; {documents: 314_483, volumes: 694} for FRUS. */
  counts: Record<string, number>
  /** Coverage window / floor disclosure — e.g. "Federal courts, post-Jan 20
   * 2025" for litigation; "1620 → 1991" for FRUS. */
  coverage: string
  /** When the corpus was last updated (data-freshness signal). For litigation
   * this is MAX(last_synced_at) per brief #6 decision 10; for stable corpora
   * (OLC/FRUS/USC/CFR) it's the most recent ingest run. */
  lastUpdated: Date | string
  /** Provenance splits where meaningful — e.g. OLC's {dojPublished: 1439,
   * knightFoia: 706}; FRUS's {mainSeries: ~552, supplements: ~142}. */
  provenance?: Record<string, number>
  /** Known gaps, free-form bullets — surfaces honestly what's missing. */
  knownGaps?: string[]
}

/**
 * Query modes ported from the legacy litigation surface (brief #6 decision 3).
 * Spokes opt into the modes that fit their corpus.
 */
export type QueryMode =
  | 'manual_filter'      // free; structured filter form
  | 'claude_sql'         // AI writes SQL from NL
  | 'claude_read'        // AI reads each item per criterion (keep/drop)
  | 'claude_analysis'    // analytical narrative + per-item annotations
  | 'claude_ama'         // agentic plan→execute→synthesize
  | 'advisory_retrieval' // brief #7 decision 6 — user supplies fact pattern;
                         // system maps to theories/items from the corpus

/**
 * The three flagships established across briefs #1, #5, #6, #7:
 *   - retrieval: locate specific items
 *   - filtering: narrow the field by structured criteria
 *   - analytical: ask questions over the field
 *
 * Different spokes weight them differently. FRUS (brief #5) and OLC (brief #2)
 * name one paradigmatic flagship (analytical/narrative-synthesis); litigation
 * (brief #6) and USC/CFR have all three co-equal; collection pages (brief #7
 * decision 4) de-emphasize retrieval.
 */
export type Flagship = 'retrieval' | 'filtering' | 'analytical'

export type FlagshipsConfig = {
  /** Which flagships are first-class on this spoke. */
  present: Flagship[]
  /** If non-null, the paradigmatic flagship (visually + architecturally
   * weighted as primary). Set for asymmetric spokes (FRUS, OLC);
   * null for symmetric spokes (litigation, USC, CFR). */
  paradigmatic: Flagship | null
}

/** A structured filter facet — drives one control in the manual-filter form. */
export type FacetSpec = {
  /** Stable identifier used in URL params and query construction. */
  id: string
  /** Display label shown above the control. */
  label: string
  /** Control type drives which UI primitive renders it. */
  control: 'fts' | 'text' | 'dropdown' | 'multi-select' | 'date-range'
  /** For dropdown/multi-select: where the options come from. */
  optionsSource?: 'static' | 'corpus-query'
  /** For optionsSource='static': the option list. */
  staticOptions?: { value: string; label: string }[]
  /** Optional placeholder hint shown in the control. */
  placeholder?: string
}

/**
 * A pre-built one-click scope filter — the "scopes library" pattern across
 * briefs. FRUS auto-derives ~694 from volume metadata; litigation uses
 * structural presets (All/District/Circuit/None for courts); other spokes
 * may curate them by hand.
 */
export type ScopeSpec = {
  id: string
  label: string
  description?: string
  /** Filter expression — opaque to the descriptor; interpreted by the
   * spoke's query layer. Often a partial set of facet values. */
  filter: Record<string, unknown>
  /** Provenance — distinguishes auto-derived from hand-curated scopes. */
  source: 'derived' | 'curated'
}

/**
 * "More like this" capability declaration (per 2026-05-27 architecture-hook
 * decision). Presence of this field on a spoke = the spoke participates in
 * the "more like this" feature once implementation lands post-beta.
 *
 * v1 = type declared + spoke slots filled in stub form; no UI rendered (the
 * actual button / prompt UI / agent flow ships post-beta).
 */
export type MoreLikeThisCapability = {
  /** What "document" means for this corpus — the smallest selectable unit. */
  documentUnit: {
    /** Singular noun shown in UI ("case", "opinion", "section", "document"). */
    label: string
    /** Whether sub-documents within the unit are selectable as their own
     * pivot seeds. True for litigation (a specific filing within a case can
     * be a seed); false for OLC (the opinion is atomic), USC, CFR, FRUS. */
    supportsSubDocuments?: boolean
  }
  /** Pre-populated similarity hints offered to the user when they invoke
   * "more like this." Pre-fill the "more like this how?" prompt as one-click
   * chips, but the user can always type free-form. Per-spoke because the
   * relevant similarity dimensions are corpus-shaped. */
  similarityHints: string[]
  /** Whether multi-doc selection is supported. Per the 2026-05-27 reframing,
   * multi-doc isn't structurally harder than single-doc (the user provides
   * the semantic anchor; the agent uses N exemplars instead of 1). UX
   * surfacing may still differ. */
  supportsMultiSelect: boolean
  /** Whether this spoke permits cross-corpus pivots. v1: all false per the
   * 2026-05-27 decision (cross-corpus deferred to Phase 2 alongside other
   * cross-corpus features). */
  permitsCrossCorpusPivot: boolean
}

/**
 * The descriptor every spoke implements. The generic spoke renderer reads
 * this to drive everything — UI shape, query modes available, facets,
 * holdings disclosure, "more like this" hooks.
 */
export type CorpusSpoke = {
  /** URL slug. Stable; used in routing. */
  slug: CorpusSlug
  /** Human-readable title. */
  title: string
  /** One-sentence description shown in the hub and nav. */
  description: string
  /** Lifecycle status. */
  status: SpokeStatus
  /** Routing path (defaults to `/corpus/${slug}` if undefined). */
  route?: string

  /** Plain-English disclosure per brief #6 decision 9b — the editorial top
   * line surfaced prominently in the spoke header. Each spoke's brief
   * declares its wording. */
  plainEnglishDisclosure: string
  /** Async provider for the holdings block (brief #6 decision 9a). */
  getHoldings: () => Promise<CorpusHoldings>

  /** Which of the five+1 query modes this spoke supports. */
  queryModes: QueryMode[]
  /** How the three flagships are weighted on this spoke. */
  flagships: FlagshipsConfig
  /** Structured filter facets. Drives the manual-filter form. */
  facets: FacetSpec[]
  /** Pre-built one-click scope overlays. Optional — some spokes have none
   * (litigation's court presets are structural; FRUS auto-derives ~694
   * from volumes; OLC/USC/CFR may add curated ones later). */
  scopes?: ScopeSpec[]
  /** Suggestion chips — one-click query entry points. Per-spoke editorial
   * choice; UI renders them on the spoke landing surface. */
  suggestionChips?: string[]

  /** Default search-depth for AI ops (brief #6 decision 8; brief #7 flip
   * for collections). 'docket-only' is cheaper; 'full-doc' is the
   * substantive lever. Collections override their parent corpus's default
   * to 'full-doc'. */
  defaultSearchDepth: 'docket-only' | 'full-doc'

  /** "More like this" capability declaration (2026-05-27 hook decision).
   * Undefined = spoke doesn't participate; defined = spoke declares its
   * document unit + similarity hints + cross-corpus posture. */
  moreLikeThis?: MoreLikeThisCapability

  /** Semantic retrieval is live for this corpus (brief #9, locked
   * 2026-06-11): the manual-filter surface gains the keyword/semantic/both
   * toggle (default both, segregated panes, overlap badged). Only set on
   * corpora with embeddings in doc_chunks — absence means the toggle simply
   * doesn't render (no grayed-out tease). */
  semanticSearch?: boolean
}
