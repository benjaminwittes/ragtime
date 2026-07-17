import type { FbiDocumentDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import {
  fbiCollectionLabel,
  formatWaybackDate,
  isWaybackRecovered,
} from './fbi-format'

/**
 * FBI Records manual-filter results table.
 *
 * Columns: Title · Collection · Part · OCR · ↗ (PDF). Deliberately NO date
 * column — doc_date is NULL corpus-wide, so where other spokes show a date
 * this table shows the collection.
 *
 * The provenance rule (locked decision #1 — facet + badge, not marquee):
 * rows with provenance='wayback-recovered' carry a quiet "removed from the
 * Vault" chip under the title with the Wayback capture date. Live rows show
 * nothing.
 *
 * The table is exported separately as `FbiDocumentRowsTable` so the AMA
 * cited-documents panel renders the identical shape.
 */
export function FbiResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly FbiDocumentDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: FbiDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Search the OCR text, pick a Vault collection, or filter to the
          documents removed from the Vault.
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
          No documents matched. These are OCR&rsquo;d historical records in
          period vocabulary — try the era&rsquo;s own terms
          (&ldquo;counterintelligence program,&rdquo; not
          &ldquo;COINTELPRO&rdquo;), a collection from the typeahead, or the
          semantic toggle to bridge the wording gap.
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
      <FbiDocumentRowsTable
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
export function FbiDocumentRowsTable({
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly FbiDocumentDisplayRow[]
  onOpenDocument: (row: FbiDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Collection</Th>
            <Th>Part</Th>
            <Th>OCR</Th>
            <Th className="text-right" aria-label="PDF link" />
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
                <span className="text-foreground">{r.title ?? '(no title)'}</span>
                {semanticMatchIds?.has(String(r.id)) && (
                  <span className="ml-2 inline-block align-middle">
                    <AlsoMatchBadge kind="semantic" />
                  </span>
                )}
                <RecoveredChip row={r} />
              </Td>
              <Td className="text-xs text-muted-foreground">
                {fbiCollectionLabel(r) ?? '—'}
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {r.part_label ?? '—'}
              </Td>
              <Td>
                <OcrQualityBadge value={r.ocr_quality} />
              </Td>
              <Td className="text-right">
                <PdfLink row={r} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The quiet provenance badge (locked decision #1): renders ONLY on
 * wayback-recovered rows, with the capture date. Not a marquee — a fact.
 */
export function RecoveredChip({ row }: { row: FbiDocumentDisplayRow }) {
  if (!isWaybackRecovered(row.provenance)) return null
  const captured = formatWaybackDate(row.wayback_timestamp)
  return (
    <span
      className="ml-2 inline-block whitespace-nowrap rounded bg-amber-500/10 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300"
      title={
        'This document was removed from the Vault; our copy comes from a Wayback Machine capture' +
        (captured ? ` of ${captured}.` : '.')
      }
    >
      removed from the Vault{captured ? ` · captured ${captured}` : ''}
    </span>
  )
}

/** Quiet OCR-quality badge — 'clean' / 'normalized' / 'degraded'. */
export function OcrQualityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>
  return (
    <span
      className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
      title="These are OCR’d scans; text fidelity varies by document."
    >
      {value}
    </span>
  )
}

/** "↗" affordance to the original scan PDF (Vault page fallback). */
function PdfLink({ row }: { row: FbiDocumentDisplayRow }) {
  const href = row.pdf_url || row.source_url
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open the original scan PDF in a new tab"
      aria-label={`Open PDF for ${row.title ?? 'document ' + row.id} in a new tab`}
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
