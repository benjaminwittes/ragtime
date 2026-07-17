import type { SanctionsEntityDisplayRow } from '@/lib/worker-client'
import { aliasLine, entityTypeLabel, listTypeLabel } from './sanctions-format'

/**
 * Sanctions entity results table (the marquee pane's list).
 *
 * Columns: Name (with the a.k.a. line) · Type · Programs · EOs · List.
 * Deliberately NO date column — publish_date is the copy's freshness stamp
 * (one value corpus-wide), and rendering it per-row would read as a
 * designation date, which it is not. The header band shows the one honest
 * date ("list data as of …") once.
 *
 * The table is exported separately as `SanctionsEntityRowsTable` so the AMA
 * entity branch's cited-entities panel renders the identical shape.
 */
export function SanctionsEntityResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenEntity,
}: {
  rows: readonly SanctionsEntityDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenEntity: (row: SanctionsEntityDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Search the current SDN and consolidated lists by name or alias, or
          filter by program, executive order, list, or entity type.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Searching the lists…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-sm text-destructive">Search failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-center text-sm text-muted-foreground">
          No match in this copy of the current lists. That is NOT clearance —
          this copy lags OFAC, delisted entries vanish, and transliterated
          names hide under alternate spellings. Try a shorter fragment or an
          alias, and check OFAC&rsquo;s official Sanctions List Search before
          relying on an absence.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} entries · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <SanctionsEntityRowsTable rows={rows} onOpenEntity={onOpenEntity} />
    </div>
  )
}

/**
 * Just the table — reused by the results list above and the AMA entity
 * branch's cited-entities panel, so cited rows match search rows exactly.
 */
export function SanctionsEntityRowsTable({
  rows,
  onOpenEntity,
}: {
  rows: readonly SanctionsEntityDisplayRow[]
  onOpenEntity: (row: SanctionsEntityDisplayRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Programs</Th>
            <Th>Executive orders</Th>
            <Th>List</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const akas = aliasLine(r.aliases)
            return (
              <tr
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenEntity(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenEntity(r)
                  }
                }}
                aria-label={`Open ${r.primary_name ?? 'entry ' + r.id} in detail panel`}
                className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
              >
                <Td>
                  <span className="font-medium text-foreground">
                    {r.primary_name ?? '(unnamed)'}
                  </span>
                  {akas && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      a.k.a. {akas}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {entityTypeLabel(r.entity_type)}
                </Td>
                <Td>
                  <ProgramChips programs={r.programs} />
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {r.eo_numbers && r.eo_numbers.length > 0
                    ? r.eo_numbers.map((n) => `EO ${n}`).join(', ')
                    : '—'}
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {listTypeLabel(r.list_type)}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ProgramChips({
  programs,
  max = 4,
}: {
  programs: readonly string[] | null
  max?: number
}) {
  if (!programs || programs.length === 0) {
    return <span className="text-muted-foreground/50">—</span>
  }
  const shown = programs.slice(0, max)
  const more = programs.length - shown.length
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span
          key={p}
          className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {p}
        </span>
      ))}
      {more > 0 && (
        <span className="whitespace-nowrap px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70">
          +{more}
        </span>
      )}
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
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={'px-3 py-2 text-left font-medium ' + (className ?? '')}>
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
