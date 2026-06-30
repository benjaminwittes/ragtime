/**
 * Brief #6 §0 decision 1 — stack runtime.
 *
 * Every operation produces a `StackPage`; the spoke renderer keeps an array
 * of them and lets the user view past pages via a breadcrumb. The TIP (last
 * page) is always the active scope for new operations; viewing past pages
 * is strictly read-only — the form is disabled until the user returns to
 * the tip.
 *
 * Per the brief: stack affordances (breadcrumb, return-to-current banner)
 * appear only after at least one operation has produced a page. Empty
 * state hides them entirely.
 *
 * Design rationale (brief #6 decision 1): "auditability ... the stack
 * literally instantiates the auditability principle: the audit trail IS
 * the navigable history of operations." Each page carries the operation
 * type + label + source + rows, which together capture enough to
 * reconstruct what the user did and why.
 *
 * v1 (PR 4h, this PR): manual_filter / claude_sql / claude_read /
 * claude_analysis / claude_ama all push pages. Per-operation cost
 * ledger lands with the paid-tier sign-in PR. Cross-corpus pages
 * land in Phase 2 (brief #6 §6 future).
 */

import type { CaseDisplayRow, FilterFields } from '@/lib/worker-client'
import type { ResultSource } from './components/ResultsList'
import type { QueryMode } from './types'

/** One frame in the operations stack. */
export type StackPage = {
  /** Stable React key; survives re-renders. */
  id: string
  /** Which mode produced this page. */
  operationType: QueryMode
  /** Short human-readable label for the breadcrumb (~40 chars). */
  operationLabel: string
  /** Display rows. For narrative-only AMA pages this is empty — the
   *  answer is in `source.answerMarkdown`. */
  rows: CaseDisplayRow[]
  /** Total matched count (may exceed rows.length for paginated results). */
  count: number
  /** The FULL matched id-set (NOT the capped display `rows`). Used to build the
   *  scope for the next operation so a large filter isn't silently truncated to
   *  the 10k display rows. Absent for pages with no id-set (e.g. narrative AMA). */
  clIds?: number[]
  /** For manual_filter pages: the id-set SQL (`SELECT cl_id FROM cases WHERE …`).
   *  Sent as `scope_sql` for large scopes so we pass a tiny query instead of
   *  inlining tens of thousands of ids. */
  scopeSql?: string
  /** Provenance object that drives ResultsList's rendering. */
  source: ResultSource
  /** For manual_filter pages with a keyword search: the raw search term, used
   *  to lazily fetch per-row match snippets (highlighted `ts_headline`). Absent
   *  for non-search filters and AI-produced pages. */
  searchTerm?: string
}

/* ----------------------------------------------------------------------------
 * Label builders
 *
 * Each operation's breadcrumb label is built at push time so the stack is
 * self-describing without re-deriving copy on every render. All capped to
 * ~40 chars; the breadcrumb truncates with an ellipsis if needed.
 * ------------------------------------------------------------------------- */

const LABEL_MAX = 40

function truncate(s: string, max = LABEL_MAX): string {
  s = s.trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * Build a label for a manual_filter page from the submitted fields. Picks
 * the most-informative axes first (search > name > collection > judge >
 * cause > caseType > courts > date range). If nothing meaningful is set,
 * falls back to "Filter".
 */
export function buildManualFilterLabel(fields: FilterFields): string {
  if (fields.search?.trim()) {
    return truncate(`Search: "${fields.search.trim()}"`)
  }
  if (fields.name?.trim()) {
    return truncate(`Case name: "${fields.name.trim()}"`)
  }
  if (fields.collection) {
    return truncate(`Collection: ${fields.collection}`)
  }
  if (fields.judge?.trim()) {
    return truncate(`Judge: ${fields.judge.trim()}`)
  }
  if (fields.cause?.trim()) {
    return truncate(`Cause: ${fields.cause.trim()}`)
  }
  if (fields.caseType) {
    const ct = {
      cv: 'Civil',
      cr: 'Criminal',
      mj: 'Magistrate',
      mc: 'Miscellaneous',
    }[fields.caseType]
    return `Case type: ${ct}`
  }
  if (fields.courts && fields.courts.length > 0 && !fields.allCourts) {
    if (fields.courts.length === 1) return `Court: ${fields.courts[0]}`
    return `Courts: ${fields.courts.length} selected`
  }
  if (fields.from || fields.to) {
    const range = `${fields.from ?? 'start'} → ${fields.to ?? 'now'}`
    return truncate(`Filed: ${range}`)
  }
  return 'Filter'
}

/** Label for an AI-writes-SQL page. Prefers the model's own short label
 *  (returned by /corpus/sql); falls back to the user's prompt. */
export function buildClaudeSqlLabel(prompt: string, modelLabel: string): string {
  if (modelLabel.trim()) return truncate(`SQL: ${modelLabel.trim()}`)
  return truncate(`SQL: ${prompt}`)
}

export function buildClaudeReadLabel(criterion: string): string {
  return truncate(`Read: ${criterion}`)
}

export function buildClaudeAnalysisLabel(prompt: string): string {
  return truncate(`Analyze: ${prompt}`)
}

export function buildClaudeAmaLabel(question: string): string {
  return truncate(`Ask: ${question}`)
}
