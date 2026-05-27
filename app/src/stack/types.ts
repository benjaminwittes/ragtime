/**
 * Stack-of-operations types.
 *
 * The stack pattern is the cross-cutting UX affordance established in
 * brief #6 decision 1: every spoke supports a stack of operations where
 * each query (filter, narrow, analyze) pushes a new page; back pops;
 * breadcrumbs let you view past pages read-only. The stack literally
 * instantiates the auditability principle as navigable history.
 *
 * This module defines the type-level primitives. The runtime implementation
 * (state container, navigation, persistence) lands in a later PR alongside
 * the litigation spoke port (PR 5).
 *
 * Critically: the stack model supports BOTH push semantics (existing
 * operations) AND stash-and-start-new semantics (the "more like this"
 * pivot per the 2026-05-27 hook decision). See `StackHistory` below.
 */

/**
 * What kind of operation produced this page. Mirrors the query modes
 * spokes can declare in their descriptor, plus a few non-query page kinds.
 */
export type PageOperation =
  | 'tip'                  // the starting page of a stack (no prior op)
  | 'manual_filter'
  | 'claude_sql'
  | 'claude_read'
  | 'claude_analysis'
  | 'claude_ama'
  | 'detail'               // case-detail / document-detail view
  | 'more_like_this'       // 2026-05-27 hook — pivot result page
  | 'advisory_retrieval'   // brief #7 decision 6 — fact-pattern → theory

/**
 * The seed for a "more like this" pivot page (per 2026-05-27 decision).
 * The user provides the similarity dimension (`similarityPrompt`); the agent
 * uses that prompt plus the seed document(s) to do semantic-to-features
 * extrapolation and search the corpus.
 *
 * Multi-doc seeds are supported architecturally (the agent uses N exemplars
 * instead of 1); UX may not surface multi-select in v1's implementation.
 */
export type PivotSeed = {
  documentIds: string[]
  similarityPrompt: string
}

/**
 * One page on the stack. Pages represent a query result, a detail view,
 * an analytical artifact, or a "more like this" pivot result.
 */
export type Page = {
  id: string
  /** Operation that produced this page. */
  operation: PageOperation
  /** When the page was created — drives ordering and the audit trail. */
  createdAt: Date
  /** Display label shown in the breadcrumb. */
  label: string
  /** The IDs of the items currently on this page (cases / opinions / etc.).
   * Optional because some operations don't produce a list (analysis output
   * just produces narrative). */
  items?: string[]
  /** Executed SQL or query expression — surfaced for auditability. */
  executedQuery?: string
  /** Estimated or actual cost in cents (for paid AI ops). */
  costCents?: number
  /** Narrative output (markdown) — for analysis / AMA pages. */
  artifactMarkdown?: string
  /** For "more like this" pivot pages: the seed that produced this page. */
  pivotSeed?: PivotSeed
}

/**
 * A stack of pages. Operations push pages onto the stack; back pops;
 * breadcrumbs allow read-only navigation to past pages.
 */
export type Stack = {
  id: string
  /** Which corpus spoke (or collection sub-spoke) the stack belongs to. */
  corpusSlug: string
  /** Pages in chronological push order; pages[0] is the tip's starting
   * page, pages[length-1] is the current tip. */
  pages: Page[]
  /** Index into `pages` of the currently-viewed page. Equal to
   * `pages.length - 1` for the tip; lower for read-only history view. */
  viewIndex: number
}

/**
 * Stack history — supports the 2026-05-27 "more like this" stash-and-pivot
 * semantic.
 *
 * Existing operations (filter / analyze / etc.) PUSH pages onto the active
 * stack. The "more like this" pivot is qualitatively different: the
 * existing stack is preserved as history, a new stack starts seeded with
 * the similarity result, and back-navigation can return to the stashed
 * stack rather than just popping pages.
 *
 * v1: types declared. Runtime implementation lands when the React app needs
 * actual navigation (likely PR 5 alongside the litigation port).
 */
export type StackHistory = {
  /** Currently-active stack. */
  active: Stack
  /** Stacks stashed by prior pivot operations, most-recent first. */
  stashed: Stack[]
}

/**
 * Helper: discriminate push-style operations from pivot operations. Push
 * operations extend the current stack; pivot operations stash + start new.
 * Documented here so future stack-state code has one place to look.
 */
export function isPivotOperation(op: PageOperation): boolean {
  return op === 'more_like_this'
}
