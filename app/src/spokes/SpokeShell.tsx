import { useEffect, useMemo, useState } from 'react'
import {
  ANALYSIS_HARD_CAP,
  type CaseDisplayRow,
  type CorpusFacets,
  type FilterFields,
  WorkerSqlError,
  fetchCorpusFacets,
  runClaudeAnalysis,
  runClaudeRead,
  runClaudeSql,
  runManualFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { useByok } from '@/llm/use-byok'
import { CaseDetailSheet } from './components/CaseDetailSheet'
import { ClaudeAnalysisForm } from './components/ClaudeAnalysisForm'
import { ClaudeReadForm } from './components/ClaudeReadForm'
import { ClaudeSqlForm } from './components/ClaudeSqlForm'
import { FilterForm } from './components/FilterForm'
import { ModeRow } from './components/ModeRow'
import { ResultsList, type ResultSource } from './components/ResultsList'
import { SpokeHeader } from './components/SpokeHeader'
import type {
  CorpusHoldings,
  CorpusSpoke,
  QueryMode,
} from './types'

/**
 * Generic spoke renderer chassis (per the SPEC.md design rationale).
 *
 * v1 (PR 4b): chassis + manual filter only.
 * v1.5 (PR 4c): + case-detail sheet.
 * v1.6 (PR 4d, this PR): + claude_sql via BYOK.
 *
 * No stack runtime yet (per brief #6 §6 modifications, stack affordances
 * appear only after at least one operation has produced a page; this PR's
 * flat one-page execution sidesteps the stack data model, which lands with
 * PR 4g). Each query supersedes the previous result page.
 *
 * Data flow:
 *   - On mount: fetch /corpus/facets, populate holdings + filter dropdowns.
 *   - On filter submit: POST /corpus/filter, replace the result rows.
 *   - On claude_sql submit: POST /corpus/sql with BYOK, replace the result
 *     rows AND surface the model-generated SQL + label per brief #6 §7b.
 *   - On mount/unmount: setActiveSpokeSlug() so the docs-overlay shows
 *     spoke-scoped entries.
 */
export function SpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const { config: byok, isConfigured: byokConfigured } = useByok()

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

  // Mode selection. manual_filter is always functional; claude_sql becomes
  // available once a BYOK is configured. claude_read additionally requires
  // a populated scope (it operates on the current result page).
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')

  // Forward-declared: rows / scope state lives further down but enabledModes
  // depends on whether rows exist, so we use a derived count below.
  // (`hasScope` is computed alongside the rows state.)

  // Result-page state. `source` tracks how the page was produced so the
  // results list can surface mode-specific provenance (e.g., the generated
  // SQL + the user's prompt for claude_sql) per brief #6 §7b auditability.
  const [rows, setRows] = useState<CaseDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [source, setSource] = useState<ResultSource | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)
  // Progress label for batched ops (claude_read). Empty during one-shot ops.
  const [progressLabel, setProgressLabel] = useState<string | undefined>(
    undefined,
  )

  const scopeSize = rows?.length ?? 0
  const enabledModes = useMemo<QueryMode[]>(() => {
    const enabled: QueryMode[] = ['manual_filter']
    if (byokConfigured) enabled.push('claude_sql')
    // claude_read / claude_analysis operate on the current scope; only
    // enable if BYOK is configured AND there are rows to read/analyze.
    if (byokConfigured && scopeSize > 0) enabled.push('claude_read')
    // claude_analysis additionally has a server-side scope cap — disabling
    // the tab beyond the cap surfaces the limit before the user invests in
    // typing a prompt.
    if (
      byokConfigured &&
      scopeSize > 0 &&
      scopeSize <= ANALYSIS_HARD_CAP
    ) {
      enabled.push('claude_analysis')
    }
    return enabled
  }, [byokConfigured, scopeSize])

  async function handleFilterSubmit(fields: FilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r = await runManualFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setSource({ kind: 'manual_filter', generatedSql: r.generated_sql })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setSource(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  async function handleClaudeSqlSubmit(prompt: string) {
    if (!byok) {
      // Shouldn't be reachable — the form disables the submit when there's
      // no key — but guard anyway.
      setQueryError('Configure a BYOK key in AI access (header) first.')
      return
    }
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r = await runClaudeSql({ prompt }, byok)
      setRows(r.display_rows)
      setCount(r.count)
      setSource({
        kind: 'claude_sql',
        prompt,
        label: r.label,
        generatedSql: r.generated_sql,
      })
    } catch (e) {
      if (e instanceof WorkerSqlError) {
        setQueryError(e.message)
        // Even on failure, surface the model's SQL so the user can
        // diagnose what the AI proposed — the auditability principle
        // (brief #6 §7b item 3).
        if (e.generatedSql) {
          setSource({
            kind: 'claude_sql',
            prompt,
            label: '',
            generatedSql: e.generatedSql,
            errored: true,
          })
        } else {
          setSource(undefined)
        }
      } else {
        setQueryError(e instanceof Error ? e.message : String(e))
        setSource(undefined)
      }
      setRows([])
      setCount(0)
    } finally {
      setQueryLoading(false)
    }
  }

  async function handleClaudeReadSubmit(criterion: string) {
    if (!byok) {
      setQueryError('Configure a BYOK key in AI access (header) first.')
      return
    }
    if (!rows || rows.length === 0) return
    const incomingIds = rows.map((r) => r.cl_id)
    const incomingMap = new Map(rows.map((r) => [r.cl_id, r]))
    setQueryLoading(true)
    setQueryError(undefined)
    setProgressLabel(`Reading 0 / ${incomingIds.length.toLocaleString()} cases…`)
    setHasRun(true)
    try {
      const { verdicts } = await runClaudeRead({
        criterion,
        clIds: incomingIds,
        byok,
        onProgress: (done, total) => {
          setProgressLabel(
            `Reading ${done.toLocaleString()} / ${total.toLocaleString()} cases…`,
          )
        },
      })
      // Filter the existing display rows to the kept set — we already have
      // the full CaseDisplayRow for every incoming case, so there's no need
      // to re-fetch via /corpus/cases (the legacy index.html re-fetches
      // because its incoming scope can outpace what's locally rendered).
      const keptRows = incomingIds
        .filter((id) => verdicts[id]?.keep)
        .map((id) => incomingMap.get(id))
        .filter((r): r is CaseDisplayRow => r != null)
      setRows(keptRows)
      setCount(keptRows.length)
      setSource({
        kind: 'claude_read',
        criterion,
        incomingCount: incomingIds.length,
        keptCount: keptRows.length,
        verdicts,
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      // Preserve the existing rows so the user doesn't lose their scope on
      // an orchestrator-level failure.
    } finally {
      setQueryLoading(false)
      setProgressLabel(undefined)
    }
  }

  async function handleClaudeAnalysisSubmit(prompt: string) {
    if (!byok) {
      setQueryError('Configure a BYOK key in AI access (header) first.')
      return
    }
    if (!rows || rows.length === 0) return
    const incomingIds = rows.map((r) => r.cl_id)
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r = await runClaudeAnalysis(prompt, incomingIds, byok)
      // Analyze never narrows — the Worker re-fetches display rows from the
      // corpus and returns them; trust those as authoritative (consistent
      // order with SQL_DISPLAY_COLS).
      setRows(r.cases)
      setCount(r.cases.length)
      setSource({
        kind: 'claude_analysis',
        prompt,
        markdown: r.markdown,
        annotations: r.annotations,
        analyzedCount: r.cases.length,
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      // Preserve scope on failure.
    } finally {
      setQueryLoading(false)
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
          loading={queryLoading}
          onSubmit={handleFilterSubmit}
        />
      )}
      {activeMode === 'claude_sql' && (
        <ClaudeSqlForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          onSubmit={handleClaudeSqlSubmit}
        />
      )}
      {activeMode === 'claude_read' && (
        <ClaudeReadForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          scopeSize={scopeSize}
          progressLabel={progressLabel}
          onSubmit={handleClaudeReadSubmit}
        />
      )}
      {activeMode === 'claude_analysis' && (
        <ClaudeAnalysisForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          scopeSize={scopeSize}
          onSubmit={handleClaudeAnalysisSubmit}
        />
      )}
      <ResultsList
        rows={rows}
        count={count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        source={source}
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
