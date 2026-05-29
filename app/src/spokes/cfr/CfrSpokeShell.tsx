import { useEffect, useState } from 'react'
import {
  type CfrFacets,
  type CfrFilterFields,
  type CfrFilterResult,
  type CfrSectionDisplayRow,
  fetchCfrFacets,
  runCfrFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '../types'
import { CfrFilterForm } from './CfrFilterForm'
import { CfrResultsList } from './CfrResultsList'
import { CfrSectionDetailSheet } from './CfrSectionDetailSheet'

/**
 * CFR spoke v1 alpha — manual filter + section detail. Parallels
 * `UscSpokeShell`; the two will be unified when AI modes for both
 * arrive and the shape of "USC-like reference spoke" stabilizes.
 *
 * The holdings band carries the regulation-specific currency: the
 * latest `up_to_date_as_of` across the corpus and a reserved-count
 * tile (~7K of the 227K sections are placeholders, useful to know).
 */
export function CfrSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<CfrFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchCfrFacets()
        if (cancelled) return
        setFacets(f)
        const h: CorpusHoldings = {
          counts: {
            sections: f.section_count,
            titles: f.titles.length,
            reserved: f.reserved_count,
          },
          coverage: `All ${f.titles.length} titles · current as of ${f.up_to_date_as_of}`,
          lastUpdated: f.up_to_date_as_of,
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

  const [rows, setRows] = useState<CfrSectionDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [openSection, setOpenSection] = useState<CfrSectionDisplayRow | null>(
    null,
  )

  function handleOpenSection(row: CfrSectionDisplayRow) {
    setOpenSection(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: CfrFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: CfrFilterResult = await runCfrFilter(fields)
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
      <CfrHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      <CfrFilterForm
        titles={facets?.titles ?? []}
        loading={queryLoading}
        onSubmit={handleSubmit}
      />
      <CfrResultsList
        rows={rows}
        count={count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        executedSql={executedSql}
        onOpenSection={handleOpenSection}
      />
      <CfrSectionDetailSheet
        row={openSection}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function CfrHeader({
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
        <HoldingTile label="Sections" value={holdings?.counts.sections} loading={loading} />
        <HoldingTile label="Titles" value={holdings?.counts.titles} loading={loading} />
        <HoldingTile label="Reserved" value={holdings?.counts.reserved} loading={loading} />
        <HoldingTile
          label="Up to date"
          stringValue={
            typeof holdings?.lastUpdated === 'string'
              ? holdings.lastUpdated
              : undefined
          }
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
