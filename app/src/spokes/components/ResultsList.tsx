import { useState } from 'react'
import type { CaseDisplayRow } from '@/lib/worker-client'

/**
 * How a result page was produced. Drives the "How this was produced"
 * disclosure rendered above the table — surfaces the executed SQL (for
 * manual_filter) or the model's generated SQL + the user's prompt + the
 * model's label (for claude_sql). Per brief #6 §7b item 3, the generated
 * SQL is always visible, not just on error.
 */
export type ResultSource =
  | {
      kind: 'manual_filter'
      generatedSql: string
    }
  | {
      kind: 'claude_sql'
      prompt: string
      label: string
      generatedSql: string
      /** True when the run failed but the model still produced SQL. */
      errored?: boolean
    }
  | {
      kind: 'claude_read'
      criterion: string
      /** Total cases read (incoming scope size). */
      incomingCount: number
      /** Cases the AI judged keep===true (= rows.length after filtering). */
      keptCount: number
      /** Per-case verdict map. Drives the keep/drop badge + reason per row. */
      verdicts: Record<number, { keep: boolean; reason: string }>
    }

/**
 * Result page — case rows + optional "how this was produced" disclosure.
 * Per brief #6 §6 modifications, the stack affordances (breadcrumb, page
 * band) are hidden until at least one operation has produced a page; the
 * empty pre-run state shows just a quiet prompt.
 */
export function ResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  source,
  onOpenCase,
}: {
  rows: readonly CaseDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  /** Whether the user has executed any filter yet. False on first paint. */
  hasRun: boolean
  /** How the current result page was produced. Undefined on pre-run or
   *  when the previous run errored without producing SQL. */
  source?: ResultSource
  /** Click handler for "open this case in the detail sheet". v1 just opens
   *  the sheet inline; the stack runtime (PR 4g) will replace this with
   *  a stack-push that records the detail as its own page. */
  onOpenCase: (row: CaseDisplayRow) => void
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
      <div className="px-6 py-8 space-y-4">
        {source && <SourceDisclosure source={source} />}
        <p className="text-sm text-destructive">Query failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-8 space-y-4">
        {source && <SourceDisclosure source={source} />}
        <p className="text-center text-sm text-muted-foreground">
          No cases matched. Try broadening the query.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {source && <SourceDisclosure source={source} />}
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
              {source?.kind === 'claude_read' && <Th>AI reason</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const verdict =
                source?.kind === 'claude_read'
                  ? source.verdicts[r.cl_id]
                  : undefined
              return (
                <tr
                  key={r.cl_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenCase(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenCase(r)
                    }
                  }}
                  aria-label={`Open ${r.case_name ?? 'case ' + r.cl_id} in detail panel`}
                  className="cursor-pointer hover:bg-muted/50 focus:bg-muted/60 focus:outline-none"
                >
                  <Td>
                    <span className="font-medium text-foreground">
                      {r.case_name ?? '(no name)'}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">
                    {r.docket_number ?? '—'}
                  </Td>
                  <Td className="font-mono text-xs uppercase">
                    {r.court ?? '—'}
                  </Td>
                  <Td className="text-xs">{r.judge ?? '—'}</Td>
                  <Td className="font-mono text-xs">{r.date_filed ?? '—'}</Td>
                  <Td
                    className="max-w-xs truncate text-xs"
                    title={r.cause ?? undefined}
                  >
                    {shortCause(r.cause)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {r.entry_count ?? '—'}
                  </Td>
                  {source?.kind === 'claude_read' && (
                    <Td className="max-w-sm text-xs text-muted-foreground">
                      {verdict?.reason ?? '—'}
                    </Td>
                  )}
                </tr>
              )
            })}
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

/**
 * Collapsible "How this was produced" disclosure. For manual_filter, shows
 * the executed SQL. For claude_sql, shows the user's prompt, the model's
 * one-line label, and the generated SQL. Per brief #6 §7b item 3, the
 * generated SQL is always visible (not just on error).
 *
 * Defaults closed for manual_filter (most users don't need to see the
 * mechanical filter SQL) and open for claude_sql (the auditability stakes
 * are higher when the AI wrote it).
 */
function SourceDisclosure({ source }: { source: ResultSource }) {
  const [open, setOpen] = useState(
    source.kind === 'claude_sql' || source.kind === 'claude_read',
  )
  const title =
    source.kind === 'claude_sql'
      ? source.errored
        ? 'How this was produced (failed)'
        : 'How this was produced'
      : source.kind === 'claude_read'
        ? `AI read ${source.incomingCount.toLocaleString()} cases · kept ${source.keptCount.toLocaleString()}`
        : 'Executed SQL'

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-muted/30"
    >
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        {title}
      </summary>
      <div className="space-y-2 border-t border-border p-3 text-xs">
        {source.kind === 'claude_sql' && (
          <>
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Your prompt
              </span>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {source.prompt}
              </p>
            </div>
            {source.label && (
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Operation label
                </span>
                <p className="mt-1 font-mono text-foreground">{source.label}</p>
              </div>
            )}
          </>
        )}
        {source.kind === 'claude_read' && (
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Criterion
            </span>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {source.criterion}
            </p>
          </div>
        )}
        {(source.kind === 'claude_sql' || source.kind === 'manual_filter') && (
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Generated SQL
            </span>
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {source.generatedSql}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}
