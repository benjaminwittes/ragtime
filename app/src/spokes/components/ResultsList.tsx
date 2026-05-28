import type { CaseDisplayRow } from '@/lib/worker-client'

/**
 * Filter result — case rows with the columns from the Worker's SQL_DISPLAY_COLS.
 * v1 (this PR): non-interactive read-only list; click handler hook is in
 * place but case-detail panel lands in PR 4c.
 *
 * Per brief #6 §6 modifications, the stack affordances (breadcrumb, page
 * band) are hidden until at least one operation has produced a page — for
 * this PR, the empty state (no filter run yet) shows just a quiet prompt;
 * a real filter run shows the results table.
 */
export function ResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
}: {
  rows: readonly CaseDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  /** Whether the user has executed any filter yet. False on first paint. */
  hasRun: boolean
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Set filter criteria above and click <span className="font-medium">Apply filter</span> to
          produce a result page.
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
      <div className="px-6 py-8">
        <p className="text-sm text-destructive">Filter failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No cases matched. Try broadening the filter.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} cases · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Case</Th>
              <Th>Docket</Th>
              <Th>Court</Th>
              <Th>Judge</Th>
              <Th>Filed</Th>
              <Th>Cause</Th>
              <Th className="text-right">Entries</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.cl_id} className="hover:bg-muted/50">
                <Td>
                  {r.cl_url ? (
                    <a
                      href={r.cl_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.case_name ?? '(no name)'}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">
                      {r.case_name ?? '(no name)'}
                    </span>
                  )}
                </Td>
                <Td className="font-mono text-xs text-muted-foreground">
                  {r.docket_number ?? '—'}
                </Td>
                <Td className="font-mono text-xs uppercase">
                  {r.court ?? '—'}
                </Td>
                <Td className="text-xs">{r.judge ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.date_filed ?? '—'}</Td>
                <Td className="max-w-xs truncate text-xs" title={r.cause ?? undefined}>
                  {shortCause(r.cause)}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {r.entry_count ?? '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <td className={'px-3 py-2 align-top ' + (className ?? '')} title={title}>
      {children}
    </td>
  )
}

function shortCause(c: string | null | undefined): string {
  if (!c) return '—'
  return c.length > 40 ? c.substring(0, 38) + '…' : c
}
