import { useEffect, useState } from 'react'
import {
  type UscFacets,
  type UscFilterFields,
  type UscFilterResult,
  type UscSectionDisplayRow,
  fetchUscFacets,
  runUscFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '../types'
import { UscFilterForm } from './UscFilterForm'
import { UscResultsList } from './UscResultsList'
import { UscSectionDetailSheet } from './UscSectionDetailSheet'

/**
 * USC spoke v1 alpha — manual filter only.
 *
 * Slim chassis intentionally separate from the litigation `SpokeShell`:
 * different schema, different filter axes, no stack runtime / no AI modes
 * in v1 (each filter supersedes for now; AI modes need USC-shaped system
 * prompts and land in a follow-up). The two will be unified when AI modes
 * land for USC and the patterns are clearer.
 *
 * Header pattern mirrors litigation: holdings band on top, then the
 * filter form, then the results list. The mode row is omitted because
 * there's only one mode.
 */
export function UscSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  // Holdings + facets in one /corpus/usc/facets call.
  const [facets, setFacets] = useState<UscFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchUscFacets()
        if (cancelled) return
        setFacets(f)
        // Drive holdings through the descriptor's getHoldings so the
        // header band still reflects the descriptor-declared shape (with
        // the live count overriding the stub if the descriptor calls back
        // to the Worker, which it doesn't in the current USC descriptor —
        // we just shape it locally instead).
        const h: CorpusHoldings = {
          counts: { sections: f.section_count, titles: f.titles.length },
          coverage: `All ${f.titles.length} titles · release point ${f.release_point}`,
          lastUpdated: f.release_point,
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

  // Result-page state. No stack yet; each filter supersedes the previous.
  const [rows, setRows] = useState<UscSectionDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // Section-detail state — analogous to the litigation case-detail
  // pattern. `openSection` lingers across the close animation so the
  // panel doesn't flicker as it slides out.
  const [detailOpen, setDetailOpen] = useState(false)
  const [openSection, setOpenSection] = useState<UscSectionDisplayRow | null>(
    null,
  )

  function handleOpenSection(row: UscSectionDisplayRow) {
    setOpenSection(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: UscFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: UscFilterResult = await runUscFilter(fields)
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
      <UscHeader spoke={spoke} holdings={holdings} loading={facetsLoading} error={facetsError} />
      <UscFilterForm
        titles={facets?.titles ?? []}
        statuses={facets?.statuses ?? []}
        loading={queryLoading}
        onSubmit={handleSubmit}
      />
      <UscResultsList
        rows={rows}
        count={count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        executedSql={executedSql}
        onOpenSection={handleOpenSection}
      />
      <UscSectionDetailSheet
        row={openSection}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

/**
 * Spoke header band — title + plain-English disclosure + holdings counts.
 * Mirrors `SpokeHeader.tsx` from the litigation spoke but inline here so
 * USC can evolve its header independently (e.g. when the release-point
 * caveat copy needs to surface differently).
 */
function UscHeader({
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
        <HoldingTile
          label="Release point"
          stringValue={
            typeof holdings?.lastUpdated === 'string'
              ? holdings.lastUpdated
              : undefined
          }
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
