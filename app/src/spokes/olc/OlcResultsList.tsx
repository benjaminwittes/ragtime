import type { OlcOpinionDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'

/**
 * OLC manual-filter results table.
 *
 * Columns: Title · Issued · Author · Source · Pages · ↗ (source link).
 * The Source column renders the DOJ-published / Knight FOIA badge; the
 * trailing ↗ link is the audit-link affordance added in PR 4v (brief #1
 * §4b: every row that mentions a document carries a one-click path to the
 * canonical primary source). When both DOJ and Knight URLs exist, DOJ
 * wins (it's the canonical archive); we surface only one to keep rows
 * scannable.
 *
 * The row-rendering table is exported separately as `OlcOpinionRowsTable`
 * so the AMA result panel can render the same shape on cited opinions
 * without duplicating the column layout (PR 4v Note 1 — cited rows match
 * manual-filter rows).
 */
export function OlcResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenOpinion,
  semanticMatchIds,
}: {
  rows: readonly OlcOpinionDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenOpinion: (row: OlcOpinionDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by title, author, source, or date range to find OLC
          opinions.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Filtering…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-sm text-destructive">Filter failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-center text-sm text-muted-foreground">
          No opinions matched. Try broadening the filter.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} opinions · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <OlcOpinionRowsTable
        rows={rows}
        onOpenOpinion={onOpenOpinion}
        semanticMatchIds={semanticMatchIds}
      />
    </div>
  )
}

/**
 * Just the table — columns + rows, no surrounding chrome. Reused by both
 * the manual-filter results list above and the AMA cited-opinions panel.
 * PR 4v: keeping a single source of truth for OLC row layout so the
 * cited-list rendering is identical to the filter-list rendering.
 */
export function OlcOpinionRowsTable({
  rows,
  onOpenOpinion,
  semanticMatchIds,
}: {
  rows: readonly OlcOpinionDisplayRow[]
  onOpenOpinion: (row: OlcOpinionDisplayRow) => void
  /** Ids also present in the semantic pane (brief #9: overlap badged in
   *  both panes). Undefined when no semantic search ran. */
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Issued</Th>
            <Th>Author</Th>
            <Th>Source</Th>
            <Th className="text-right">Pages</Th>
            <Th className="text-right" aria-label="External link" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenOpinion(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenOpinion(r)
                }
              }}
              aria-label={`Open ${r.title ?? 'opinion ' + r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td>
                <span className="font-medium text-foreground">
                  {r.title ?? '(no title)'}
                </span>
                {semanticMatchIds?.has(String(r.id)) && (
                  <span className="ml-2 inline-block align-middle">
                    <AlsoMatchBadge kind="semantic" />
                  </span>
                )}
              </Td>
              <Td className="font-mono text-xs">{r.date_issued ?? '—'}</Td>
              <Td className="text-xs text-muted-foreground">
                {r.author ?? '—'}
              </Td>
              <Td>{r.source ? <SourceBadge value={r.source} /> : '—'}</Td>
              <Td className="text-right font-mono text-xs tabular-nums">
                {r.page_count ?? '—'}
              </Td>
              <Td className="text-right">
                <SourceLink row={r} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * "↗" affordance to the canonical primary source. DOJ-published URL wins
 * over Knight FOIA URL (DOJ is the canonical archive); falls back to
 * Knight when DOJ is null. `stopPropagation` on the click prevents the
 * row's open-in-detail handler from firing when the user clicks the
 * external link.
 */
function SourceLink({ row }: { row: OlcOpinionDisplayRow }) {
  const href = row.source_url_doj || row.source_url_knight
  if (!href) return <span className="text-muted-foreground/50">—</span>
  const labelTarget = row.source_url_doj ? 'DOJ' : 'Knight FOIA'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open the canonical ${labelTarget} source in a new tab`}
      aria-label={`Open canonical source for ${row.title ?? 'opinion ' + row.id} in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function SourceBadge({ value }: { value: string }) {
  const isKnight = value === 'knight-foia'
  return (
    <span
      className={
        isKnight
          ? 'rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300'
          : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground'
      }
      title={
        isKnight
          ? 'Knight FOIA — DOJ never published, obtained via FOIA disclosure'
          : 'DOJ published — canonical archive'
      }
    >
      {value === 'doj-published'
        ? 'DOJ'
        : value === 'knight-foia'
          ? 'Knight FOIA'
          : value}
    </span>
  )
}

function ExecutedSqlDisclosure({ sql }: { sql: string }) {
  return (
    <details className="mb-3 rounded-md border border-border bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        Executed SQL
      </summary>
      <div className="border-t border-border p-3">
        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {sql}
        </pre>
      </div>
    </details>
  )
}

function Th({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children?: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <th
      aria-label={ariaLabel}
      className={
        'px-3 py-2 text-left font-medium ' + (className ?? '')
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td className={'px-3 py-2 align-top ' + (className ?? '')}>{children}</td>
  )
}
