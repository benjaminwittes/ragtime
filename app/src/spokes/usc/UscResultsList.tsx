import { buildUscSourceUrl } from '@/lib/external-source-urls'
import type { UscSectionDisplayRow } from '@/lib/worker-client'

/**
 * USC manual-filter results table.
 *
 * Columns: Citation · Heading · Title · Status. Positive-law shows as an
 * inline badge on the citation cell, per brief #3 §5 ("surface
 * is_positive_law status when relevant").
 *
 * Section-detail panel lands in a follow-up PR — for now, the row is
 * static (no click handler).
 */
export function UscResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenSection,
}: {
  rows: readonly UscSectionDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  /** Click handler — opens the section detail sheet. */
  onOpenSection: (row: UscSectionDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by citation, full-text search, title, or heading to find
          USC sections.
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
          No sections matched. Try broadening the filter.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} sections · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <UscSectionRowsTable rows={rows} onOpenSection={onOpenSection} />
    </div>
  )
}

/**
 * Just the table — columns + rows, no surrounding chrome. Reused by both
 * the manual-filter results list above and the AMA cited-sections panel
 * (PR 4v Note 1 — cited rows match filter rows exactly). USC has no
 * source_url field in the corpus; the ↗ to uscode.house.gov is deferred
 * to PR C (constructed-URL fanning).
 */
export function UscSectionRowsTable({
  rows,
  onOpenSection,
}: {
  rows: readonly UscSectionDisplayRow[]
  onOpenSection: (row: UscSectionDisplayRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Citation</Th>
            <Th>Heading</Th>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th className="text-right" aria-label="External link" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenSection(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenSection(r)
                }
              }}
              aria-label={`Open ${r.citation ?? 'section ' + r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">
                    {r.citation ?? '—'}
                  </span>
                  {r.is_positive_law && <PositiveLawBadge />}
                </div>
              </Td>
              <Td className="text-xs text-foreground">
                {r.heading ?? '—'}
              </Td>
              <Td className="text-xs">
                {r.title_num != null && (
                  <span className="font-mono text-muted-foreground">
                    {r.title_num}
                  </span>
                )}
                {r.title_name && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    · {prettyTitleName(r.title_name)}
                  </span>
                )}
              </Td>
              <Td>
                {r.status ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.status}
                  </span>
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
 * "↗" affordance to uscode.house.gov (PR 4x). Brief #1 §4b auditability:
 * every row that mentions a section carries a one-click path to the
 * canonical primary source. USC has no source_url field; URL is
 * constructed deterministically from (title_num, section_identifier).
 * `stopPropagation` keeps the row's open-in-detail handler from firing.
 */
function SourceLink({ row }: { row: UscSectionDisplayRow }) {
  const href = buildUscSourceUrl(row)
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open this section on uscode.house.gov in a new tab"
      aria-label={`Open canonical source for ${row.citation ?? 'section ' + row.id} in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function PositiveLawBadge() {
  return (
    <span
      className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary"
      title="Positive law title — the codified text is itself the binding statute"
    >
      positive law
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
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
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

function prettyTitleName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
