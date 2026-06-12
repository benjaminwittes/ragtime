import type { PresidentialDocumentDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'

/**
 * Presidential Documents manual-filter results table.
 *
 * Columns: Citation · Title · President · Signed · Text · ↗ (FR link).
 * Citation leads (display_citation — 'Executive Order 14239', 'Memorandum
 * of March 18, 2025') because it's the unit researchers cite. The Text
 * column renders the finding-aid badge for metadata-only rows (brief #11:
 * show by default, badge keys off text_quality and retires per-row as
 * backfill text arrives). The trailing ↗ goes to federalregister.gov.
 *
 * The table is exported separately as `PresidentialDocumentRowsTable` so
 * the AMA cited-documents panel renders the identical shape.
 */
export function PresidentialResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly PresidentialDocumentDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: PresidentialDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by type, president, number, agency, or date range to find
          presidential documents.
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
          No documents matched. Try broadening the filter — note that
          presidential documents use formal register (&ldquo;suspension of
          entry,&rdquo; not &ldquo;travel ban&rdquo;).
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
      <PresidentialDocumentRowsTable
        rows={rows}
        onOpenDocument={onOpenDocument}
        semanticMatchIds={semanticMatchIds}
      />
    </div>
  )
}

/**
 * Just the table — reused by the manual-filter results list above and the
 * AMA cited-documents panel, so cited rows match filter rows exactly.
 */
export function PresidentialDocumentRowsTable({
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly PresidentialDocumentDisplayRow[]
  onOpenDocument: (row: PresidentialDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Citation</Th>
            <Th>Title</Th>
            <Th>President</Th>
            <Th>Signed</Th>
            <Th>Text</Th>
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
              aria-label={`Open ${r.display_citation ?? 'document ' + r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
                {r.display_citation ?? '—'}
              </Td>
              <Td>
                <span className="text-foreground">{r.title ?? '(no title)'}</span>
                {semanticMatchIds?.has(String(r.id)) && (
                  <span className="ml-2 inline-block align-middle">
                    <AlsoMatchBadge kind="semantic" />
                  </span>
                )}
              </Td>
              <Td className="text-xs text-muted-foreground">
                {r.president_name ?? '—'}
              </Td>
              <Td className="font-mono text-xs">{r.signing_date ?? '—'}</Td>
              <Td>
                <TextQualityBadge value={r.text_quality} />
              </Td>
              <Td className="text-right">
                <FrLink row={r} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "↗" affordance to the canonical Federal Register page (PDF fallback). */
function FrLink({ row }: { row: PresidentialDocumentDisplayRow }) {
  const href = row.html_url || row.pdf_url
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open on federalregister.gov in a new tab"
      aria-label={`Open canonical source for ${row.display_citation ?? 'document ' + row.id} in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

/**
 * Text-availability badge. The brief #11 decision: metadata-only rows show
 * by default with a "finding aid" badge that keys off text_quality and
 * retires per-row as backfill text arrives. Full-text rows render quietly.
 */
export function TextQualityBadge({ value }: { value: string | null }) {
  if (value === 'metadata_only') {
    return (
      <span
        className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
        title="Finding aid only — the Federal Register has not digitized this document's text; the original lives at the FR/NARA link"
      >
        Finding aid
      </span>
    )
  }
  return (
    <span
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
      title={
        value === 'juris_backfill'
          ? 'Full text — typed text recovered from DOJ’s retired JURIS database'
          : 'Full text — Federal Register'
      }
    >
      Full text
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
      className={'px-3 py-2 text-left font-medium ' + (className ?? '')}
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
