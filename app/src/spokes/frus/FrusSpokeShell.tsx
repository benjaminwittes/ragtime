import { useEffect, useState } from 'react'
import {
  type FrusDocumentDisplayRow,
  type FrusFacets,
  type FrusFilterFields,
  type FrusFilterResult,
  fetchFrusFacets,
  runFrusFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '../types'
import { FrusDocumentDetailSheet } from './FrusDocumentDetailSheet'
import { FrusFilterForm } from './FrusFilterForm'
import { FrusResultsList } from './FrusResultsList'

/**
 * FRUS spoke v1 alpha — manual filter + document detail. Parallels USC /
 * CFR / OLC. The "Tell me about [event] in [period]" analytical flagship
 * (brief #5's paradigmatic mode) lands in a follow-up.
 *
 * Holdings band surfaces both the document count and the volume tally so
 * users get a sense of the corpus's two-tier structure (552 volumes with
 * docs out of 694 total — the 142 placeholder volumes are the lagging
 * publication tail).
 */
export function FrusSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<FrusFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchFrusFacets()
        if (cancelled) return
        setFacets(f)
        const h: CorpusHoldings = {
          counts: {
            documents: f.document_count,
            volumes: f.volume_count,
            with_docs: f.volumes_with_docs,
          },
          coverage: `${f.earliest} → ${f.latest}`,
          lastUpdated: f.latest,
        }
        if (cancelled) return
        setHoldings(h)
      } catch (e) {
        if (cancelled) return
        setFacetsError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setFacetsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const [rows, setRows] = useState<FrusDocumentDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [openDocument, setOpenDocument] = useState<FrusDocumentDisplayRow | null>(
    null,
  )

  function handleOpenDocument(row: FrusDocumentDisplayRow) {
    setOpenDocument(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: FrusFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: FrusFilterResult = await runFrusFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setExecutedSql(r.executed_sql)
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setExecutedSql(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FrusHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      <FrusFilterForm
        subSeries={facets?.sub_series ?? []}
        classifications={facets?.classifications ?? []}
        loading={queryLoading}
        onSubmit={handleSubmit}
      />
      <FrusResultsList
        rows={rows}
        count={count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        executedSql={executedSql}
        onOpenDocument={handleOpenDocument}
      />
      <FrusDocumentDetailSheet
        row={openDocument}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function FrusHeader({
  spoke,
  holdings,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  holdings: CorpusHoldings | undefined
  loading: boolean
  error: string | undefined
}) {
  const docs = holdings?.counts.documents
  const volumes = holdings?.counts.volumes
  const withDocs = holdings?.counts.with_docs
  return (
    <header className="border-b border-border bg-card px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            {spoke.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {spoke.plainEnglishDisclosure}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DocsTrigger />
          <AccessSettings />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HoldingTile label="Documents" value={docs} loading={loading} />
        <HoldingTile label="Volumes" value={volumes} loading={loading} />
        <HoldingTile
          label="With docs"
          value={withDocs}
          loading={loading}
        />
        <HoldingTile
          label="Coverage"
          stringValue={holdings?.coverage}
          loading={loading}
        />
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">
          Could not load holdings: {error}
        </p>
      )}
    </header>
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-medium tabular-nums text-foreground">
        {loading
          ? '…'
          : stringValue
            ? stringValue
            : value != null
              ? value.toLocaleString()
              : '—'}
      </p>
    </div>
  )
}
