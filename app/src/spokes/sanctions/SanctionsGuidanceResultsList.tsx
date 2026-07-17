import type { SanctionsGuidanceDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import { guidanceTypeLabel } from './sanctions-format'
import { ProgramChips } from './SanctionsEntityResultsList'

/**
 * OFAC guidance results table.
 *
 * Columns: Title · Type · Programs · Issued · ↗ (ofac.treasury.gov).
 * 31 documents carry no issued_date — those rows show "undated" rather than
 * a blank, so the gap stays visible instead of reading like a data error.
 *
 * The table is exported separately as `SanctionsGuidanceRowsTable` so the
 * AMA prose branch's cited-sources panel renders the identical shape.
 */
export function SanctionsGuidanceResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly SanctionsGuidanceDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: SanctionsGuidanceDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Search OFAC&rsquo;s published guidance — FAQs, enforcement actions,
          and general licenses — or filter by type, program, or executive
          order.
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
          No guidance matched. This corpus is OFAC&rsquo;s published documents
          only — the sanctions regulations themselves live in the CFR corpus
          (31 CFR chapter V). Try OFAC&rsquo;s own vocabulary
          (&ldquo;blocked persons,&rdquo; &ldquo;general license&rdquo;) or
          the semantic toggle.
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
      <SanctionsGuidanceRowsTable
        rows={rows}
        onOpenDocument={onOpenDocument}
        semanticMatchIds={semanticMatchIds}
      />
    </div>
  )
}

/** Just the table — shared with the AMA cited-sources panel. */
export function SanctionsGuidanceRowsTable({
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly SanctionsGuidanceDisplayRow[]
  onOpenDocument: (row: SanctionsGuidanceDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Type</Th>
            <Th>Programs</Th>
            <Th>Issued</Th>
            <Th className="text-right" />
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
                <span className="text-foreground">{r.title ?? '(untitled)'}</span>
                {semanticMatchIds?.has(`guidance:${r.id}`) && (
                  <span className="ml-2 inline-block align-middle">
                    <AlsoMatchBadge kind="semantic" />
                  </span>
                )}
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted-foreground">
                {guidanceTypeLabel(r.guidance_type)}
              </Td>
              <Td>
                <ProgramChips programs={r.programs} max={3} />
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {r.issued_date ?? 'undated'}
              </Td>
              <Td className="text-right">
                {r.source_url ? (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open on ofac.treasury.gov in a new tab"
                    aria-label={`Open ${r.title ?? 'document ' + r.id} on ofac.treasury.gov`}
                    className="inline-block text-primary hover:underline"
                  >
                    ↗
                  </a>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
