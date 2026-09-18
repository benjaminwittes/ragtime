import { useState } from 'react'
import type { SemanticSearchRow } from '@lawfare/ragtime-client'
import { cn } from '@/lib/utils'

/**
 * Semantic-pane result list (brief #9). Shared by every embedded spoke:
 * unlike the keyword pane (which reuses each spoke's rich filter table),
 * semantic results have a corpus-neutral shape — title / date / context /
 * best-chunk snippet / similarity — so one ruled list serves all spokes.
 *
 * Overlap is badged, not deduped (brief #9 decision 3): a row whose id is
 * in `keywordIds` carries an "also a keyword match" badge. The set comes
 * from the spoke filter's FULL matching-id list, so the badge isn't limited
 * to the keyword pane's displayed top rows.
 */
export function SemanticResultsList({
  rows,
  loading,
  error,
  hasRun,
  /** Full id set from the keyword filter (for overlap badges). Pass
   *  undefined when no keyword search ran (semantic-only mode). */
  keywordIds,
  /** Open the document in the spoke's detail panel. The spoke resolves the
   *  id to its full display row (items-by-ids) before opening. */
  onOpen,
  /** Opening rows may need a per-row metadata fetch; this id renders its
   *  row in a loading state meanwhile. */
  openingId,
}: {
  rows: readonly SemanticSearchRow[] | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  keywordIds?: ReadonlySet<string>
  onOpen: (row: SemanticSearchRow) => void
  openingId?: string | null
}) {
  if (!hasRun && !loading) return null

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Searching by meaning…
        </p>
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

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No conceptually similar documents found.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {rows.length.toLocaleString()} closest by meaning
      </p>
      {/* No gap: the rows have to touch for the rule between them to be the thing that
          separates them. A gap plus a rule is a box in two pieces. */}
      <ol>
        {rows.map((row) => (
          <SemanticResultCard
            key={row.id}
            row={row}
            isKeywordMatch={keywordIds?.has(row.id) ?? false}
            opening={openingId === row.id}
            onOpen={onOpen}
          />
        ))}
      </ol>
    </div>
  )
}

/**
 * Pane label for the side-by-side view — the segregation is the point
 * (brief #9 decision 2): the user should always know WHY a result came
 * back.
 *
 * This used to name a "both" mode the reader could pick. The keyword /
 * semantic / both toggle came off the spokes on 2026-09-18 (Mary Ford:
 * the app does not make that distinction in Search), so both retrievals
 * now always run and this label is the only place the difference is
 * stated. Decision 2 survives the toggle's removal — it is about
 * explaining a result, not about choosing a mode.
 */
export function ResultsPaneHeader({ kind }: { kind: 'keyword' | 'semantic' }) {
  return (
    // The pane label keeps its wash this slice. It is the only thing telling two
    // side-by-side panes apart in the shells whose keyword pane this change does not
    // reach, so dropping the fill here would unlabel a surface nobody asked me to touch.
    // Its rule takes the app's content hairline.
    <div className="border-b border-lawfare-line bg-muted/40 px-6 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {kind === 'keyword' ? 'Matched your words' : 'Matched your meaning'}
      </p>
      <p className="text-[11px] text-muted-foreground/80">
        {kind === 'keyword'
          ? 'Full-text keyword search; all structured filters apply.'
          : 'Conceptual similarity on the search text; other filters don’t constrain this pane.'}
      </p>
    </div>
  )
}

/**
 * Cross-pane overlap badge (brief #9 decision 3): a document in both result
 * sets is the strongest signal, so it appears in BOTH panes, badged with
 * its membership in the other one. `kind` names the OTHER pane.
 */
export function AlsoMatchBadge({ kind }: { kind: 'keyword' | 'semantic' }) {
  return (
    <span
      title={
        kind === 'keyword'
          ? 'This document is also in your keyword results — the strongest signal.'
          : 'This document is also in your semantic results — the strongest signal.'
      }
      className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
    >
      {kind === 'keyword' ? 'also a keyword match' : 'also a semantic match'}
    </span>
  )
}

function SemanticResultCard({
  row,
  isKeywordMatch,
  opening,
  onOpen,
}: {
  row: SemanticSearchRow
  isKeywordMatch: boolean
  opening: boolean
  onOpen: (row: SemanticSearchRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      {/* Ten results in ten bordered, rounded cards on `bg-card` was the claim the hub and
          the Explorer both retired: a result is not a thing apart from the page, it is a
          row on it. So the box goes and a hairline opens each row, the same rule the table
          of cases next to it is ruled with. The element stays a `<button>` and still opens
          the document — a border is not what makes a thing clickable here; the pointer and
          the hover wash are, and both are kept. The horizontal padding goes with the box
          that justified it, so the row now starts on the same measure as the count above
          it. */}
      <button
        type="button"
        onClick={() => onOpen(row)}
        disabled={opening}
        className={cn(
          'w-full border-t border-lawfare-line py-3 text-left transition-colors hover:bg-muted',
          opening && 'cursor-wait opacity-60',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{row.title}</p>
          {isKeywordMatch && <AlsoMatchBadge kind="keyword" />}
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {[row.date, row.context].filter(Boolean).join(' · ')}
          {row.similarity != null && (
            <span title="Cosine similarity of the best-matching passage.">
              {' '}
              · {(row.similarity * 100).toFixed(0)}% similar
            </span>
          )}
          {opening && ' · opening…'}
        </p>
        {row.snippet && (
          <p
            className={cn(
              'mt-1.5 text-xs leading-relaxed text-muted-foreground',
              !expanded && 'line-clamp-2',
            )}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {row.snippet}
            {row.snippet.length >= 280 && '…'}
          </p>
        )}
      </button>
    </li>
  )
}
