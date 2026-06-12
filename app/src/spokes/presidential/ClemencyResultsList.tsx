import type { ClemencyGrantDisplayRow } from '@/lib/worker-client'

/**
 * Clemency grant results table. Columns: Recipient · Type · President ·
 * Date · Topic · Source. The Source column renders the provenance badge —
 * the auditability axis: a "Wikipedia" badge marks grants whose recipient
 * name is Wikipedia-derived (the January 6 set DOJ recorded only as a
 * class), so a name sourced from Wikipedia is never shown as if it came
 * from a DOJ warrant.
 */
export function ClemencyResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  onOpenGrant,
}: {
  rows: readonly ClemencyGrantDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  onOpenGrant: (row: ClemencyGrantDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by recipient, type, president, topic, district, or source to
          find clemency grants.
        </p>
      </div>
    )
  }
  if (loading) {
    return <div className="px-6 py-12 text-center"><p className="text-sm text-muted-foreground">Filtering…</p></div>
  }
  if (error) {
    return <div className="px-6 py-8"><p className="text-sm text-destructive">Filter failed: {error}</p></div>
  }
  if (!rows || rows.length === 0) {
    return <div className="px-6 py-8 text-center"><p className="text-sm text-muted-foreground">No grants matched. Try broadening the filter.</p></div>
  }

  return (
    <div className="px-6 py-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} grants · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <ClemencyRowsTable rows={rows} onOpenGrant={onOpenGrant} />
    </div>
  )
}

export function ClemencyRowsTable({
  rows,
  onOpenGrant,
}: {
  rows: readonly ClemencyGrantDisplayRow[]
  onOpenGrant: (row: ClemencyGrantDisplayRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Recipient</Th>
            <Th>Type</Th>
            <Th>President</Th>
            <Th>Granted</Th>
            <Th>Topic</Th>
            <Th>Source</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.pardon_id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenGrant(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenGrant(r) }
              }}
              aria-label={`Open ${r.person_name ?? 'grant ' + r.pardon_id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td>
                <span className="font-medium text-foreground">{r.person_name ?? '(unnamed)'}</span>
                {r.has_reoffended && (
                  <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive" title="Documented post-grant offense">
                    reoffended
                  </span>
                )}
              </Td>
              <Td><ClemencyTypeBadge value={r.clemency_type} /></Td>
              <Td className="text-xs text-muted-foreground">{r.president_name ?? '—'}</Td>
              <Td className="font-mono text-xs">{r.grant_date ?? '—'}</Td>
              <Td className="text-xs">{r.topic ?? <span className="text-muted-foreground/50">—</span>}</Td>
              <Td><ProvenanceBadge value={r.provenance} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ClemencyTypeBadge({ value }: { value: string | null }) {
  const commute = value === 'Commutation'
  return (
    <span className={
      commute
        ? 'rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-700 dark:text-sky-300'
        : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground'
    }>
      {value ?? '—'}
    </span>
  )
}

/**
 * Provenance badge — the auditability axis. 'wikipedia_derived' gets a
 * distinct amber badge with an explanatory title (the Jan 6 names DOJ
 * recorded as a class, individualized from Wikipedia); 'doj' / 'whitehouse'
 * are quiet.
 */
export function ProvenanceBadge({ value }: { value: string | null }) {
  if (value === 'wikipedia_derived') {
    return (
      <span
        className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
        title="Recipient name is Wikipedia-derived — DOJ recorded this clemency as a class (e.g. the January 6 blanket pardon), not by individual name"
      >
        Wikipedia
      </span>
    )
  }
  const label = value === 'doj' ? 'DOJ' : value === 'whitehouse' ? 'White House' : (value ?? '—')
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground" title={value === 'doj' ? 'From a DOJ Office of the Pardon Attorney warrant' : undefined}>
      {label}
    </span>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={'px-3 py-2 align-top ' + (className ?? '')}>{children}</td>
}
