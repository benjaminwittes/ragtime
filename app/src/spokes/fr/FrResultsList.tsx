import type { FrDocumentDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import { isTodayOrLater, prettyDocType } from './fr-format'

/**
 * Federal Register manual-filter results table.
 *
 * Columns: Citation · Title · Type · Agencies (first 2) · Published · ↗.
 * The operative-fact rule (brief #12): when a document's comment window is
 * still open (comments_close_on >= today), a prominent "comments close
 * YYYY-MM-DD" chip renders under the title — the one fact a reader can
 * still act on. Closed windows stay quiet (the detail sheet has the full
 * dates block).
 *
 * The table is exported separately as `FrDocumentRowsTable` so the AMA
 * cited-documents panel renders the identical shape.
 */
export function FrResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly FrDocumentDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: FrDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by type, agency, date, CFR reference, or comment status to
          find Federal Register documents.
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
          Federal Register documents use regulatory register (&ldquo;blocked
          persons,&rdquo; not &ldquo;sanctioned people&rdquo;), and notices
          are only partially loaded.
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
      <FrDocumentRowsTable
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
export function FrDocumentRowsTable({
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly FrDocumentDisplayRow[]
  onOpenDocument: (row: FrDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Citation</Th>
            <Th>Title</Th>
            <Th>Type</Th>
            <Th>Agencies</Th>
            <Th>Published</Th>
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
              aria-label={`Open ${r.fr_citation ?? 'document ' + r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <Td className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
                {r.fr_citation ?? '—'}
              </Td>
              <Td>
                <span className="text-foreground">{r.title ?? '(no title)'}</span>
                {semanticMatchIds?.has(String(r.id)) && (
                  <span className="ml-2 inline-block align-middle">
                    <AlsoMatchBadge kind="semantic" />
                  </span>
                )}
                <CommentsCloseChip date={r.comments_close_on} />
              </Td>
              <Td>
                <DocTypeBadge value={r.doc_type} />
              </Td>
              <Td className="text-xs text-muted-foreground">
                {formatAgencies(r.agency_names)}
              </Td>
              <Td className="font-mono text-xs">{r.publication_date ?? '—'}</Td>
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

/** First two agencies; "+n" for the rest (Treasury sub-agency chains get long). */
function formatAgencies(names: string[] | null): string {
  if (!names || names.length === 0) return '—'
  const shown = names.slice(0, 2).join(' · ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}

/** The operative-fact chip: renders ONLY while the window is still open. */
export function CommentsCloseChip({ date }: { date: string | null }) {
  if (!isTodayOrLater(date)) return null
  return (
    <span
      className="ml-2 inline-block whitespace-nowrap rounded bg-emerald-500/10 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
      title="The public comment window for this document is still open"
    >
      comments close {date}
    </span>
  )
}

/** Quiet type badge — 'rule' / 'proposed rule' / 'notice'. */
export function DocTypeBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>
  return (
    <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      {prettyDocType(value).replace(/s$/, '')}
    </span>
  )
}

/** "↗" affordance to the canonical federalregister.gov page (PDF fallback). */
function FrLink({ row }: { row: FrDocumentDisplayRow }) {
  const href = row.html_url || row.pdf_url
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open on federalregister.gov in a new tab"
      aria-label={`Open canonical source for ${row.fr_citation ?? 'document ' + row.id} in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
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
