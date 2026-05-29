import { useEffect, useState } from 'react'
import {
  type OlcFacets,
  type OlcFilterFields,
  type OlcFilterResult,
  type OlcOpinionDisplayRow,
  fetchOlcFacets,
  runOlcFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '../types'
import { OlcFilterForm } from './OlcFilterForm'
import { OlcOpinionDetailSheet } from './OlcOpinionDetailSheet'
import { OlcResultsList } from './OlcResultsList'

/**
 * OLC spoke v1 alpha — manual filter + opinion detail. Parallels
 * UscSpokeShell and CfrSpokeShell.
 *
 * Holdings band surfaces the dual-provenance counts (DOJ-published +
 * Knight FOIA) per brief #2 — the Knight FOIA net-new is a real part
 * of the OLC story and the user deserves to see it up top.
 */
export function OlcSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<OlcFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchOlcFacets()
        if (cancelled) return
        setFacets(f)
        const doj =
          f.sources.find((s) => s.value === 'doj-published')?.count ?? 0
        const knight =
          f.sources.find((s) => s.value === 'knight-foia')?.count ?? 0
        const h: CorpusHoldings = {
          counts: { opinions: f.opinion_count },
          coverage: `${f.earliest} → ${f.latest}`,
          lastUpdated: f.latest,
          provenance: {
            doj_published: doj,
            knight_foia: knight,
          },
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

  const [rows, setRows] = useState<OlcOpinionDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [openOpinion, setOpenOpinion] = useState<OlcOpinionDisplayRow | null>(
    null,
  )

  function handleOpenOpinion(row: OlcOpinionDisplayRow) {
    setOpenOpinion(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: OlcFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: OlcFilterResult = await runOlcFilter(fields)
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
      <OlcHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      <OlcFilterForm
        sources={facets?.sources ?? []}
        ocrQualities={facets?.ocr_qualities ?? []}
        loading={queryLoading}
        onSubmit={handleSubmit}
      />
      <OlcResultsList
        rows={rows}
        count={count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        executedSql={executedSql}
        onOpenOpinion={handleOpenOpinion}
      />
      <OlcOpinionDetailSheet
        row={openOpinion}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function OlcHeader({
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
  const doj = holdings?.provenance?.doj_published
  const knight = holdings?.provenance?.knight_foia
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
        <HoldingTile label="Opinions" value={holdings?.counts.opinions} loading={loading} />
        <HoldingTile label="DOJ published" value={doj} loading={loading} />
        <HoldingTile label="Knight FOIA" value={knight} loading={loading} />
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
