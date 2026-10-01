import type { BookDisplayRow } from '@lawfare/ragtime-client'
import { ResultWindow } from '../components/ResultWindow'
import {
  displayAuthors,
  displayTitle,
  displayYear,
  booksEmptyHint,
  editionCounts,
  languageName,
} from './books-format'

/**
 * Book catalogue results table.
 *
 * Columns: Title · Author(s) · Published · Pages · Language · LC class. Roles
 * (editor, translator) are not on the display row — the Worker keeps the
 * structured contributors for /record — so this table names people and the
 * record sheet says what each of them did.
 *
 * The count is a floor when the Worker says so (`countIsFloor`): a broad
 * filter matches more than it will count. And the "N editions here" badge
 * counts shared `work_cluster_key`s among the rows fetched, not across the
 * catalogue — the key is a heuristic, and the badge's title says both.
 */
export function BooksResultsList({
  rows,
  count,
  countIsFloor,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenRecord,
  emptyHint,
  snapshotYear,
}: {
  rows: readonly BookDisplayRow[] | undefined
  count: number | undefined
  countIsFloor: boolean
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenRecord: (row: BookDisplayRow) => void
  /** Overrides the default no-match text (the id-set handoff has its own). */
  emptyHint?: string
  /** The catalogue's edition year from /facets, when it has loaded. */
  snapshotYear?: number
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Find a book by author, title, subject, language, date or length. Every
          result is a catalogue record — it tells you a book exists and what the
          Library says it is about, and points you to where you can read it.
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
      <div className="space-y-4 px-6 py-8">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-sm text-destructive">Filter failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="space-y-4 px-6 py-8">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="mx-auto max-w-xl text-center text-sm text-muted-foreground">
          {emptyHint ?? booksEmptyHint(snapshotYear)}
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <ResultWindow rows={rows} count={count} countIsFloor={countIsFloor} noun="records">
        {(visible) => (
          <BookRowsTable rows={visible} editions={editionCounts(rows)} onOpenRecord={onOpenRecord} />
        )}
      </ResultWindow>
    </div>
  )
}

export function BookRowsTable({
  rows,
  editions,
  onOpenRecord,
}: {
  rows: readonly BookDisplayRow[]
  /** Cluster key → how many fetched rows share it (from `editionCounts`). */
  editions: ReadonlyMap<string, number>
  onOpenRecord: (row: BookDisplayRow) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th>Title</Th>
            <Th>Author(s)</Th>
            <Th>Published</Th>
            <Th className="text-right">Pages</Th>
            <Th>Language</Th>
            <Th>LC class</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const authors = displayAuthors(r)
            const title = displayTitle(r)
            const n = r.work_cluster_key ? editions.get(r.work_cluster_key) : undefined
            return (
              <tr
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenRecord(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenRecord(r)
                  }
                }}
                aria-label={`Open the catalogue record for ${title}`}
                className="cursor-pointer border-t border-lawfare-line hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
              >
                <Td>
                  <span className="text-foreground">{title}</span>
                  {r.edition && (
                    <span className="ml-2 text-xs text-muted-foreground">{r.edition.replace(/[\s.]+$/, '')}</span>
                  )}
                  {n != null && (
                    <span
                      className="ml-2 inline-block whitespace-nowrap rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                      title="Records in these results that look like the same work (same title and first author). A cataloguing heuristic over the rows shown, not a count of every edition the Library holds."
                    >
                      {n} editions here
                    </span>
                  )}
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {authors.length === 0 ? '—' : authors.length > 2 ? `${authors.slice(0, 2).join('; ')} +${authors.length - 2}` : authors.join('; ')}
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{displayYear(r) ?? '—'}</Td>
                <Td className="whitespace-nowrap text-right font-mono text-xs text-muted-foreground">{r.page_count ?? '—'}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{languageName(r.language) ?? '—'}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.classification ?? '—'}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ExecutedSqlDisclosure({ sql }: { sql: string }) {
  return (
    <details className="mb-3 border-t border-lawfare-line bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        Executed SQL
      </summary>
      <div className="border-t border-lawfare-line p-3">
        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">{sql}</pre>
      </div>
    </details>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-3 py-2 text-left font-medium ' + (className ?? '')}>{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={'px-3 py-2 align-top ' + (className ?? '')}>{children}</td>
}
