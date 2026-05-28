# Per-corpus capability descriptor — design spec

Every corpus surface ("spoke") in RAGtime implements the `CorpusSpoke`
TypeScript interface defined in `./types.ts`. A generic spoke renderer
reads this descriptor to drive UI shape, query modes, facets, holdings
disclosure, and feature availability — so that adding a new corpus is
mostly a declarative exercise (describe the corpus) plus any genuinely
corpus-specific UI hooks, rather than a from-scratch React app per corpus.

This spec explains the design rationale and how the descriptor maps to
decisions in the strategic briefs.

## Design goals

1. **Declarative over imperative.** A spoke is data first, behavior second.
   The descriptor captures *what's true about the corpus*; the renderer
   captures *how to display anything that's true*.

2. **Strategic decisions encoded as types.** Brief #6's "every spoke has
   a plain-English disclosure" (decision 9b), brief #7's "collections
   default to full-doc reads" (decision 8), the 2026-05-27 "more like this"
   architecture hook — these are encoded in the type system so future
   spokes get them by construction, not by convention.

3. **Override-surface composition for collections.** Brief #7 decision 2
   ("one architecture, override-surface config") means collection sub-
   spokes inherit from a parent corpus spoke (litigation) with declarative
   overrides. The descriptor is designed to compose: a collection's
   descriptor is structurally identical to a corpus's, just typically
   sparser (overrides only what's different).

4. **Future hooks reserved, not over-built.** The 2026-05-27 "more like
   this" architecture-hook decision says: build the reserved slots now;
   ship the implementation post-beta. `MoreLikeThisCapability` and the
   `Page` type's `pivotSeed` field are present from v1; the rendering
   and agent flow come later. Same logic for collection-context-aware
   AI mode hooks and cross-corpus pivots (Phase 2).

## Map of descriptor fields to strategic decisions

| Field | Brief / decision | Notes |
|---|---|---|
| `slug`, `title`, `description`, `status`, `route` | brief #1 — router | Standard identity + lifecycle. |
| `plainEnglishDisclosure` | brief #6 decision 9b (cross-cutting) | Editorial top-line; each spoke's brief declares the wording. |
| `getHoldings` | brief #6 decision 9a (cross-cutting) | Corpus-holdings data block. Async because some counts come from Worker /corpus/* queries. |
| `queryModes` | brief #6 decision 3 + brief #7 decision 6 | The five litigation modes ported wholesale, plus the new `advisory_retrieval` mode for collections. Spokes opt in. |
| `flagships` | briefs #2, #5, #6 §0, #7 decision 4 | Three flagships (retrieval / filtering / analytical); spoke declares which are present and whether one is paradigmatic. Litigation/USC/CFR = symmetric; FRUS/OLC = paradigmatic-analytical. |
| `facets` | brief #6 §2, brief #7 §2 | Structured filter axes. Drives the manual-filter form. Collections add `attribute_facets` from `collection_cases.attributes` jsonb (per brief #7). |
| `scopes` | brief #6 §2, brief #5 §2, brief #7 §2 | Named one-click filters. FRUS auto-derives ~694 from volume metadata; litigation uses court presets; OLC/USC/CFR may add curated ones; collections override per brief #7. |
| `suggestionChips` | brief #6 §1, brief #5 §1 | Per-spoke editorial chips. Litigation's set is placeholder pending the litigation query-refinement series. |
| `defaultSearchDepth` | brief #6 decision 8, brief #7 decision 8 | `'docket-only'` for litigation main surface; collections override to `'full-doc'`. |
| `moreLikeThis` | 2026-05-27 architecture-hook decision | Slot defined; spokes can declare their document unit and similarity hints. UI implementation post-beta. |

## What's NOT in the descriptor (intentionally)

- **Per-collection editorial content.** Collections layer their config on
  top of the parent corpus's descriptor via the override-surface pattern
  (brief #7 decision 2). The architecture spec for that override surface
  is in brief #7 §2; the type-level shape lands in a later PR when
  collection rendering ships.
- **Agent prompts.** The system prompts for `claude_analysis` / `claude_ama`
  / etc. are configured at the AI layer (the Worker + prompt-engineering
  layer beneath the UI). The descriptor declares *which modes* a spoke
  supports; the *how-the-AI-behaves-in-each-mode* config lives lower in
  the stack.
- **Cost-preview UI specifics.** Pricing is consistent across spokes
  (Lawfare-billed Anthropic with the existing computeCostCents pricing
  in the Worker); the cost-preview modal is a shared component. The
  descriptor's `defaultSearchDepth` is what flows into the cost preview's
  default state.
- **Query execution.** Spokes declare *that* they support `manual_filter`
  / `claude_sql` etc.; the *execution* (which Worker endpoint to hit, how
  to interpret results) is implemented by the shared query layer + each
  spoke's per-corpus query module that lands when the spoke is fully
  implemented.

## The Page + Stack types (in `../stack/types.ts`)

The stack pattern is cross-cutting per brief #6 decision 1. Type-level
support for both PUSH semantics (existing operations) AND STASH-AND-PIVOT
semantics (the 2026-05-27 "more like this" hook) is built in from PR 3 so
that the runtime implementation (lands later, probably PR 5) doesn't have
to refactor the data model after the fact.

Specifically:
- `Page` has a `pivotSeed?: PivotSeed` field — populated only on pages
  that result from a "more like this" pivot.
- `Stack` is the linear sequence; `StackHistory` wraps it with a
  `stashed: Stack[]` array to support the pivot-stash semantic.
- `isPivotOperation(op)` is the single source of truth on which
  operations push vs. pivot.

## Registry

`./registry.ts` exports the central spoke registry the shell reads.
v1 has only the `litigation` stub; spokes get added in their PRs.
Collection sub-spokes will live in a separate registry that inherits
from the corpus registry — added when collection architecture ships.
