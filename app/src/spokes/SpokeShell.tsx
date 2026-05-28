import { useEffect, useState } from 'react'
import {
  type CaseDisplayRow,
  type CorpusFacets,
  type FilterFields,
  fetchCorpusFacets,
  runManualFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { CaseDetailSheet } from './components/CaseDetailSheet'
import { FilterForm } from './components/FilterForm'
import { ModeRow } from './components/ModeRow'
import { ResultsList } from './components/ResultsList'
import { SpokeHeader } from './components/SpokeHeader'
import type {
  CorpusHoldings,
  CorpusSpoke,
  QueryMode,
} from './types'

/**
 * Generic spoke renderer chassis (per the SPEC.md design rationale).
 *
 * v1 (PR 4b): chassis + manual filter only. Other modes are visible in the
 * mode row but disabled until later PRs. No stack runtime yet (per brief #6
 * §6 modifications, stack affordances appear only after at least one
 * operation has produced a page; this PR's flat one-page execution sidesteps
 * the stack data model, which lands with PR 4d-4g).
 *
 * Data flow:
 *   - On mount: fetch /corpus/facets, populate holdings + filter dropdowns.
 *   - On filter submit: POST /corpus/filter with the form fields, replace
 *     the result rows. (No stack yet — each submit just supersedes.)
 *   - On mount/unmount: setActiveSpokeSlug() so the docs-overlay shows
 *     spoke-scoped entries.
 */
export function SpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()

  // Docs context: tell the overlay which spoke is active so entries scoped
  // to this corpus appear (per docs-registry contract from PR 4a / #36).
  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  // Holdings (top band). Async per descriptor; uses /corpus/facets here.
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [holdingsError, setHoldingsError] = useState<string | undefined>(
    undefined,
  )
  const [holdingsLoading, setHoldingsLoading] = useState(true)

  // Facet data (courts / judges / collections). Cached alongside holdings.
  const [facets, setFacets] = useState<CorpusFacets | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // Single call serves both purposes — getHoldings (per descriptor)
        // and the filter form. The Worker's /corpus/facets returns counts
        // + dropdown lists in one round-trip.
        const f = await fetchCorpusFacets()
        if (cancelled) return
        setFacets(f)
        // Drive holdings through the descriptor so any future override on
        // the holdings shape doesn't get bypassed here.
        const h = await spoke.getHoldings()
        if (cancelled) return
        setHoldings(h)
      } catch (e) {
        if (cancelled) return
        setHoldingsError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setHoldingsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spoke])

  // Mode selection. v1 only manual_filter is functional.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const enabledModes: QueryMode[] = ['manual_filter']

  // Filter results state. Per brief #6 §6, stack affordances are hidden
  // until a page exists — `hasRun` tracks that for the empty-state UI.
  const [rows, setRows] = useState<CaseDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [filterLoading, setFilterLoading] = useState(false)
  const [filterError, setFilterError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  async function handleFilterSubmit(fields: FilterFields) {
    setFilterLoading(true)
    setFilterError(undefined)
    setHasRun(true)
    try {
      const r = await runManualFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
    } catch (e) {
      setFilterError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
    } finally {
      setFilterLoading(false)
    }
  }

  // Case-detail state. Open === true while the sheet is mounted+animating;
  // openCase keeps the row reference around through the close animation so
  // the panel content doesn't flicker on dismiss. (We don't clear openCase
  // until the user picks a new one or refilters.)
  const [detailOpen, setDetailOpen] = useState(false)
  const [openCase, setOpenCase] = useState<CaseDisplayRow | null>(null)

  function handleOpenCase(row: CaseDisplayRow) {
    setOpenCase(row)
    setDetailOpen(true)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpokeHeader
        spoke={spoke}
        holdings={holdings}
        loading={holdingsLoading}
        error={holdingsError}
      />
      <ModeRow
        modes={spoke.queryModes}
        activeMode={activeMode}
        enabledModes={enabledModes}
        onSelect={setActiveMode}
      />
      {activeMode === 'manual_filter' && (
        <FilterForm
          facets={spoke.facets}
          facetData={
            facets
              ? {
                  courts: facets.courts,
                  judges: facets.judges,
                  collections: facets.collections,
                }
              : undefined
          }
          loading={filterLoading}
          onSubmit={handleFilterSubmit}
        />
      )}
      <ResultsList
        rows={rows}
        count={count}
        loading={filterLoading}
        error={filterError}
        hasRun={hasRun}
        onOpenCase={handleOpenCase}
      />
      <CaseDetailSheet
        case={openCase}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
