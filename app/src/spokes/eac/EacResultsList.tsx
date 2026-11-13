import type { EacDocumentDisplayRow } from '@lawfare/ragtime-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import { ResultWindow } from '../components/ResultWindow'
import { SearchedAs } from '../components/SearchedAs'
import { FallbackResults } from '../components/FallbackResults'
import { showsFallback, type BoxFallbackView } from '@/lib/box-fallback'
import {
  eacDate,
  eacLink,
  eacTitle,
  fileTypeLabel,
  isFullDisplay,
} from './eac-format'

/**
 * EAC manual-filter results table.
 *
 * Columns: Title · Author group · Posted · Type · ↗ (eac.gov).
 *
 * The display-tier rule: a row that does not say `display: 'full'` carries a
 * "link only" chip under its title, and nothing else from it is shown beyond
 * what the Worker returned (title, author group, link and — where the route
 * keeps it — date). Link-only rows from /filter currently arrive without a
 * date or file type; the cells show "—".
 *
 * No "Save to Recordbench" here: the bench fetches each saved document's text
 * itself, and it is not yet known to honour EAC's link-only tier.
 */
export function EacResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  searchedAs,
  fallback,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly EacDocumentDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  /** The "Searched as" line (lib/searched-as.ts), shown under the count. */
  searchedAs?: string | null
  executedSql: string | undefined
  onOpenDocument: (row: EacDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
  /** Hybrid search's results when keyword search found nothing. */
  fallback?: BoxFallbackView
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Search the EAC&rsquo;s documents by words or title, or filter by who
          wrote them, file type, folder or date posted.
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
    if (showsFallback(fallback)) return <FallbackResults fallback={fallback} searchedAs={searchedAs} />
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-center text-sm text-muted-foreground">
          No documents matched. Try fewer words, a wider date range, or the
          semantic toggle to search by meaning.
        </p>
        <SearchedAs line={searchedAs} centered />
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <ResultWindow searchedAs={searchedAs} rows={rows} count={count} noun="documents">
        {(visible) => (
          <EacDocumentRowsTable
            rows={visible}
            onOpenDocument={onOpenDocument}
            semanticMatchIds={semanticMatchIds}
          />
        )}
      </ResultWindow>
    </div>
  )
}

/** Just the table, so any other EAC list (more-like-this, cited rows) can match it. */
export function EacDocumentRowsTable({
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  rows: readonly EacDocumentDisplayRow[]
  onOpenDocument: (row: EacDocumentDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Author group</Th>
            <Th>Posted</Th>
            <Th>Type</Th>
            <Th className="text-right" aria-label="Link to eac.gov" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const title = eacTitle(r.title)
            return (
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
                aria-label={`Open ${title} in detail panel`}
                className="cursor-pointer border-t border-lawfare-line hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
              >
                <Td>
                  <span className="text-foreground">{title}</span>
                  {semanticMatchIds?.has(String(r.id)) && (
                    <span className="ml-2 inline-block align-middle">
                      <AlsoMatchBadge kind="semantic" />
                    </span>
                  )}
                  {!isFullDisplay(r) && <LinkOnlyChip />}
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {r.author_group ?? '—'}
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {eacDate(r) ?? '—'}
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {fileTypeLabel(r.file_type) ?? '—'}
                </Td>
                <Td className="text-right">
                  <EacGovLink href={eacLink(r)} title={title} />
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The quiet tier badge on a link-only row. */
export function LinkOnlyChip() {
  return (
    <span
      className="ml-2 inline-block whitespace-nowrap rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground"
      title="Written by an outside author. RAGtime searches its text but shows only its title, date, author group and link — open it on eac.gov to read it."
    >
      link only
    </span>
  )
}

/** "↗" to the document on eac.gov. */
function EacGovLink({ href, title }: { href: string | null; title: string }) {
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open on eac.gov in a new tab"
      aria-label={`Open ${title} on eac.gov in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function ExecutedSqlDisclosure({ sql }: { sql: string }) {
  return (
    <details className="mb-3 border-t border-lawfare-line bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        Executed SQL
      </summary>
      <div className="border-t border-lawfare-line p-3">
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
