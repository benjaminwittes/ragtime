import type { OlcOpinionDisplayRow } from '@/lib/worker-client'

/**
 * OLC manual-filter results table.
 *
 * Columns: Title · Issued · Author · Source · Pages. Source renders as a
 * compact badge so users can tell DOJ-published vs Knight FOIA at a
 * glance — the dual-provenance story is part of the OLC corpus's value
 * (Knight FOIA opinions are net-new releases DOJ never published).
 *
 * Row click opens the OlcOpinionDetailSheet.
 */
export function OlcResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenOpinion,
}: {
  rows: readonly OlcOpinionDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenOpinion: (row: OlcOpinionDisplayRow) => void
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
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Title</Th>
              <Th>Issued</Th>
              <Th>Author</Th>
              <Th>Source</Th>
              <Th className="text-right">Pages</Th>
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
                </Td>
                <Td className="font-mono text-xs">{r.date_issued ?? '—'}</Td>
                <Td className="text-xs text-muted-foreground">
                  {r.author ?? '—'}
                </Td>
                <Td>
                  {r.source ? <SourceBadge value={r.source} /> : '—'}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {r.page_count ?? '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
