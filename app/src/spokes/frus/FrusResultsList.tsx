import type { FrusDocumentDisplayRow } from '@/lib/worker-client'

/**
 * FRUS manual-filter results table.
 *
 * Columns: Title · Date · Volume · Place · Classification · ↗ (source link).
 * Classification renders with a status badge so users can see "Top Secret"
 * / "Secret" inline. Volume id is monospace because users will recognize
 * it as a stable identifier they can copy or refer to. The trailing ↗ is
 * the audit-link affordance (PR 4v Note 5) — every row gets a one-click
 * path to the canonical history.state.gov page. Brief #1 §4b: for FRUS,
 * the State Department's publication IS the canonical check.
 *
 * The row table is exported as `FrusDocumentRowsTable` so the AMA result
 * panel can render the same shape on cited documents without duplicating
 * the column layout (PR 4v Note 1).
 */
export function FrusResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
}: {
  rows: readonly FrusDocumentDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: FrusDocumentDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by title, sub-series, classification, place, or date range
          to find FRUS documents.
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
          No documents matched. Try broadening the filter.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} documents · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <FrusDocumentRowsTable rows={rows} onOpenDocument={onOpenDocument} />
    </div>
  )
}

/**
 * Just the table — columns + rows, no surrounding chrome. Reused by both
 * the manual-filter results list above and the AMA cited-documents panel
 * (PR 4v Note 1 — cited rows match filter rows exactly).
 */
export function FrusDocumentRowsTable({
  rows,
  onOpenDocument,
}: {
  rows: readonly FrusDocumentDisplayRow[]
  onOpenDocument: (row: FrusDocumentDisplayRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Date</Th>
            <Th>Volume</Th>
            <Th>Place</Th>
            <Th>Classification</Th>
            <Th className="text-right" aria-label="External link" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDocument(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenDocument(r)
                }
              }}
              aria-label={`Open ${r.title ?? 'document ' + r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td>
                <span className="font-medium text-foreground">
                  {r.title ?? '(no title)'}
                </span>
              </Td>
              <Td className="font-mono text-xs">{r.doc_date ?? '—'}</Td>
              <Td className="font-mono text-xs text-muted-foreground">
                {r.volume_id ?? '—'}
              </Td>
              <Td className="text-xs">{r.place_name ?? '—'}</Td>
              <Td>
                {r.classification ? (
                  <ClassificationBadge value={r.classification} />
                ) : (
                  '—'
                )}
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
 * "↗" affordance to the canonical history.state.gov page. `source_url` is
 * 100% populated in the FRUS corpus (verified 2026-05-29). `stopPropagation`
 * keeps the row's open-in-detail handler from firing when the user clicks
 * the external link.
 */
function SourceLink({ row }: { row: FrusDocumentDisplayRow }) {
  const href = row.source_url
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open the canonical history.state.gov page in a new tab"
      aria-label={`Open canonical source for ${row.title ?? 'document ' + row.id} in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function ClassificationBadge({ value }: { value: string }) {
  const isSecret = /secret/i.test(value)
  return (
    <span
      className={
        isSecret
          ? 'rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive'
          : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground'
      }
      title={value}
    >
      {value}
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
