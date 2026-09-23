import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/**
 * How many rows enter the DOM at once, and how many each "Show more" adds.
 *
 * Why there is a cap at all, measured rather than assumed (2026-09-18): the
 * Worker caps `display_rows` at 10,000 and every results list rendered all of
 * them. A plain `secretary` search on USC returns `count` 25,495 with 10,000
 * rows attached, which is ~650,000px of table — the browser lays out and paints
 * every one of them before the reader sees the first. OLC is not even capped
 * server-side: `president` returns 1,375 of 1,375.
 *
 * 100 is about seven screens at the ~65px a row measures, which is more than a
 * reader scans before narrowing the filter. The whole fetched set stays
 * reachable two other ways that predate this cap: `Download CSV ↓` on the
 * export bar writes every fetched row, and narrowing the filter is the answer
 * the count line points at.
 */
export const ROW_PAGE = 100

/**
 * The count line, a windowed slice of rows, and the control that widens it.
 *
 * Wraps the result table rather than replacing it: `children` is a render prop
 * taking the visible slice, so each spoke keeps its own columns and its own
 * `XRowsTable`. That matters because those tables are shared with the AMA
 * cited-rows panels, which render a small complete set and must NOT be capped —
 * putting the window in the table would have capped them too.
 *
 * The caller passes `noun` already pluralised (congress computes it from the
 * active collection), and `count` as the Worker's total match count — which is
 * usually larger than `rows.length`, because the Worker truncates before we do.
 * All three numbers are different and the line says so when they differ:
 *
 *   25,495 sections · first 10,000 fetched · showing 100     (USC, both cuts)
 *   1,375 opinions · showing 100                             (OLC, our cut only)
 *   84 opinions                                              (nothing truncated)
 */
export function ResultWindow<T>({
  rows,
  count,
  noun,
  children,
}: {
  rows: readonly T[]
  /** The Worker's total match count. Falls back to what it actually sent. */
  count: number | undefined
  /** Already pluralised for the total — "sections", "opinions", "cases". */
  noun: string
  children: (visible: readonly T[]) => ReactNode
}) {
  const [limit, setLimit] = useState(ROW_PAGE)

  // Reset the window when a new result page arrives. This is React's
  // adjust-state-during-render pattern, deliberately not an effect: the same
  // reset written as `useEffect` would paint the old window's height for a
  // frame, and would trip `react-hooks/set-state-in-effect` — the rule already
  // suppressed once in ExplorerPage. Every call site passes a `useState` value,
  // so the identity is stable across re-renders and this cannot loop.
  const [seen, setSeen] = useState(rows)
  if (seen !== rows) {
    setSeen(rows)
    setLimit(ROW_PAGE)
  }

  const fetched = rows.length
  const total = count ?? fetched
  const shown = Math.min(limit, fetched)
  const visible = shown < fetched ? rows.slice(0, shown) : rows
  const remaining = fetched - shown

  return (
    <>
      {/* Polite, because the only thing that changes it in place is the
          reader's own press of Show more. */}
      <p
        className="mb-3 font-mono text-xs text-muted-foreground"
        aria-live="polite"
      >
        {total.toLocaleString()} {noun}
        {fetched < total && <> · first {fetched.toLocaleString()} fetched</>}
        {shown < fetched && <> · showing {shown.toLocaleString()}</>}
      </p>
      {children(visible)}
      {remaining > 0 && (
        // A rule above, never a box around: the control is separated from the
        // last row the same way one row is separated from the next. The button
        // itself keeps its four sides, which is what a control is allowed.
        <div className="mt-0 flex justify-center border-t border-lawfare-line pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimit((n) => n + ROW_PAGE)}
          >
            Show {Math.min(ROW_PAGE, remaining).toLocaleString()} more
          </Button>
        </div>
      )}
    </>
  )
}
