import type { CfrSectionDisplayRow } from '@/lib/worker-client'

/**
 * CFR manual-filter results table.
 *
 * Columns: Citation · Heading · Title · Up to date. Reserved sections
 * render with a "reserved" badge on the citation cell, since they're
 * useful to recognize at a glance (placeholder text, no substantive
 * regulation yet).
 *
 * Row click → CfrSectionDetailSheet.
 */
export function CfrResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenSection,
}: {
  rows: readonly CfrSectionDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenSection: (row: CfrSectionDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by citation, full-text search, title, part, or heading to
          find CFR sections.
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
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Citation</Th>
              <Th>Heading</Th>
              <Th>Title</Th>
              <Th>Up to date</Th>
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
                    {r.reserved && <ReservedBadge />}
                  </div>
                </Td>
                <Td className="text-xs text-foreground">{r.heading ?? '—'}</Td>
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
                  {r.up_to_date_as_of ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {r.up_to_date_as_of}
                    </span>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReservedBadge() {
  return (
    <span
      className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
      title="Reserved section — placeholder, no substantive regulation yet"
    >
      reserved
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
