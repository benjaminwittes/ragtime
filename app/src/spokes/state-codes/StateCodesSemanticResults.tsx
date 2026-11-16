import type {
  SemanticSearchRow,
  StateCodeSectionDisplayRow,
  StateCodesMember,
} from '@lawfare/ragtime-client'
import { StateCodeSectionRowsTable } from './StateCodesResultsList'
import { semanticRowsToSections } from './state-codes-format'

/**
 * The meaning pane, shown in the spoke's own section table rather than the
 * shared SemanticResultsList (the keyword pane's hybrid fallback does the
 * same: StateCodesFallbackResults in StateCodesResultsList.tsx).
 *
 * Why not the shared list: it shows title, date and snippet, and has no place
 * for a status. Every State Codes result has to carry its not-in-force badge,
 * its temporary-text marker and the section its rule moved to, in every pane,
 * so both panes use StateCodeSectionRowsTable. The Worker passes the status
 * fields through on every semantic result (ragtime-worker#286); a result
 * without a status is flagged "status unknown", never shown as in force.
 */
export function StateCodesSemanticResults({
  rows,
  member,
  loading,
  error,
  hasRun,
  keywordIds,
  onOpenSection,
}: {
  rows: readonly SemanticSearchRow[] | undefined
  member: StateCodesMember
  loading: boolean
  error: string | undefined
  hasRun: boolean
  /** Keys ('dc:123') the keyword pane also matched. */
  keywordIds?: ReadonlySet<string>
  onOpenSection: (row: StateCodeSectionDisplayRow) => void
}) {
  if (!hasRun && !loading) return null

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Searching by meaning…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-destructive">Semantic search failed: {error}</p>
      </div>
    )
  }

  const sections = semanticRowsToSections(rows, member)
  if (sections.length === 0) {
    return (
      <div className="px-6 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No conceptually similar sections found.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {sections.length.toLocaleString()} closest by meaning
      </p>
      <StateCodeSectionRowsTable
        rows={sections}
        onOpenSection={onOpenSection}
        keywordMatchIds={keywordIds}
      />
    </div>
  )
}
