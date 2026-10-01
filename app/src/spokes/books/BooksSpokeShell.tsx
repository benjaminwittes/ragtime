import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  type BookDisplayRow,
  type BooksFacets,
  type BooksFilterFields,
  type BooksFilterResult,
  type CorpusSpoke,
  fetchBooksFacets,
  fetchBooksItemsByIds,
  runBooksFilter,
} from '@lawfare/ragtime-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { useDeepLink, useOpenDeepLinkedDocument } from '@/lib/use-deep-link'
import { useAuth } from '@/lib/use-auth'
import { downloadCsv } from '@/lib/export-csv'
import { BOOKS_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { BackToHubLink } from '../components/BackToHubLink'
import { ExportBar } from '../components/ExportBar'
import { SpokeIdentity } from '../components/SpokeIdentity'
import { BooksFilterForm } from './BooksFilterForm'
import { BooksRecordDetailSheet } from './BooksRecordDetailSheet'
import { BooksResultsList } from './BooksResultsList'
import { booksDisclosure, describeFields, fieldsFromDeepLink } from './books-format'

/**
 * Book catalogue spoke shell (ragtime-worker#145; design in ragtime-dev
 * `docs/briefs/book-corpus-query-architecture.md`).
 *
 * One query mode, manual_filter. There is no AI mode, semantic pane or
 * more-like-this, because every one of them presumes text and this corpus
 * has none: it is catalogue records. What the shell adds instead is
 * the design's candor, structurally:
 * - the header carries the Worker's own `limits` prose (the snapshot's edition,
 *   the incompleteness inside it, the missing quality signal), so no
 *   sentence about what the catalogue can't do is remembered here;
 * - counts past the Worker's cap render as floors;
 * - every record ends in the handoff ladder (the record sheet).
 *
 * Deep links, the grammar in `packages/client/src/links.ts`:
 *   /corpus/books/<id>                 → the record sheet (an Explorer `rt://books/<id>`)
 *   /corpus/books?q=…&author=…&…       → the filter, prefilled and run; facet
 *                                        names are the Worker's filter vocabulary
 *   /corpus/books?ids=1,2,3            → exactly those records, in that order
 */
export function BooksSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<BooksFacets | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchBooksFacets()
        if (!cancelled) setFacets(f)
      } catch (e) {
        if (!cancelled) setFacetsError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setFacetsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const [rows, setRows] = useState<BookDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [countIsFloor, setCountIsFloor] = useState(false)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [lastFields, setLastFields] = useState<BooksFilterFields | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)
  const [emptyHint, setEmptyHint] = useState<string | undefined>(undefined)
  // The form is keyed on this so a pivot from the record sheet (an author,
  // a subject heading) re-seeds it rather than leaving stale inputs showing.
  const [formSeed, setFormSeed] = useState<{ n: number; fields?: BooksFilterFields }>({ n: 0 })

  const [detailOpen, setDetailOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [openRow, setOpenRow] = useState<BookDisplayRow | null>(null)

  function handleOpenRecord(row: BookDisplayRow) {
    setOpenRow(row)
    setOpenId(row.id)
    setDetailOpen(true)
  }

  // What the page was opened on: the hub's `?q=` carryover, or a workspace
  // deep link with facets or an id set.
  const deepLink = useDeepLink()
  const initialFields = useMemo<BooksFilterFields | undefined>(() => {
    const q = readCarryoverQuery() ?? undefined
    return fieldsFromDeepLink(q, deepLink?.facets ?? {}) ?? undefined
  }, [deepLink])
  const ranInitialRef = useRef(false)
  useEffect(() => {
    if (ranInitialRef.current) return
    ranInitialRef.current = true
    const ids = (deepLink?.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)
    if (ids.length > 0) void loadIds(ids)
    else if (initialFields) void handleSubmit(initialFields)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Explorer document handoff (`/corpus/books/<id>`, the target of an
  // `rt://books/<id>` citation): open the record sheet once on mount. The
  // sheet fetches the record itself, so an id is all it needs.
  useOpenDeepLinkedDocument((doc) => {
    const id = Number(doc.id)
    if (!Number.isInteger(id) || id <= 0) return
    setOpenRow(null)
    setOpenId(id)
    setDetailOpen(true)
  })

  async function handleSubmit(fields: BooksFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    setEmptyHint(undefined)
    setLastFields(fields)
    try {
      const r: BooksFilterResult = await runBooksFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setCountIsFloor(r.count_is_floor === true)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'books',
          mode: 'manual_filter',
          question: fields.search ?? describeFields(fields),
          plan: { fields, executed_sql: r.executed_sql, count_is_floor: r.count_is_floor },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setCountIsFloor(false)
      setExecutedSql(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  // `?ids=` — a result set handed over whole (an Explorer answer's records).
  async function loadIds(ids: number[]) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    setExecutedSql(undefined)
    setLastFields(undefined)
    setEmptyHint('None of the linked records are in the catalogue.')
    try {
      const r = await fetchBooksItemsByIds(ids)
      setRows(r)
      setCount(r.length)
      setCountIsFloor(false)
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
    } finally {
      setQueryLoading(false)
    }
  }

  function handlePivot(fields: BooksFilterFields) {
    setDetailOpen(false)
    setFormSeed((s) => ({ n: s.n + 1, fields }))
    void handleSubmit(fields)
  }

  function downloadFilterCsv() {
    if (!rows || rows.length === 0) return
    downloadCsv('ragtime-book-catalogue-results.csv', {
      title: `RAGtime — Book catalogue export (Library of Congress records${facets?.source_vintage != null ? `, ${facets.source_vintage} snapshot` : ''})`,
      meta: [
        { key: 'count', value: countIsFloor ? `${count}+ (floor — more matched than the catalogue will count)` : count },
        { key: 'rows_exported', value: rows.length },
        { key: 'filter', value: lastFields ? describeFields(lastFields) : '(linked id set)' },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: BOOKS_COLUMNS,
      rows,
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BooksHeader spoke={spoke} facets={facets} loading={facetsLoading} error={facetsError} />
      {/* No mode row: manual_filter is the only mode, and a row of one button
          is a choice the reader cannot make. */}
      <BooksFilterForm
        key={formSeed.n}
        facets={facets}
        loading={queryLoading}
        onSubmit={handleSubmit}
        initialFields={formSeed.n === 0 ? initialFields : formSeed.fields}
      />
      {rows && rows.length > 0 && !queryLoading && <ExportBar onCsv={downloadFilterCsv} />}
      <BooksResultsList
        rows={rows}
        count={count}
        countIsFloor={countIsFloor}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        executedSql={executedSql}
        onOpenRecord={handleOpenRecord}
        emptyHint={emptyHint}
        snapshotYear={facets?.source_vintage}
      />
      <BooksRecordDetailSheet
        recordId={openId}
        row={openRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onFilter={handlePivot}
      />
    </div>
  )
}

/**
 * Header band. The tiles are the catalogue's edition, not a freshness date:
 * the snapshot year stands where other spokes show "last updated". The
 * Worker's `limits` prose follows the disclosure, collapsed but one click
 * away — it is the part of this corpus a reader most needs and least expects.
 */
function BooksHeader({
  spoke,
  facets,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  facets: BooksFacets | undefined
  loading: boolean
  error: string | undefined
}) {
  const range =
    facets?.pub_year_min != null && facets?.pub_year_max != null
      ? `${facets.pub_year_min} → ${facets.pub_year_max}`
      : undefined
  return (
    <section className="border-b border-border bg-card px-6 py-5">
      <SpokeIdentity spoke={spoke} />
      <BackToHubLink className="mb-3" />
      <p className="max-w-3xl text-sm text-muted-foreground">{booksDisclosure(facets)}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HoldingTile label="Records" value={facets?.record_count} loading={loading} />
        <HoldingTile label="Published" stringValue={range} loading={loading} />
        <HoldingTile label="Catalogue snapshot" stringValue={facets?.source_vintage != null ? String(facets.source_vintage) : undefined} loading={loading} />
        <HoldingTile label="Full text held" stringValue="None" loading={false} />
      </div>
      {facets && facets.limits.length > 0 && (
        <details className="mt-4 max-w-3xl border-t border-lawfare-line pt-2">
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What this catalogue can’t tell you
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {facets.limits.map((l) => (
              <li key={l}>
                {/* The Worker writes these with light markdown (*Books All*, `subjectExact`). */}
                <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{l}</ReactMarkdown>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="mt-2 text-xs text-destructive">Could not load holdings: {error}</p>}
    </section>
  )
}

function HoldingTile({
  label,
  value,
  stringValue,
  loading,
}: {
  label: string
  value?: number
  stringValue?: string
  loading: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium tabular-nums text-foreground">
        {loading ? '…' : stringValue ? stringValue : value != null ? value.toLocaleString() : '—'}
      </p>
    </div>
  )
}
