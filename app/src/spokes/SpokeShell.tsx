import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CaseDisplayRow,
  type CorpusFacets,
  type FilterFields,
  type FilterResult,
  type FilterScope,
  fetchCasesByIds,
  fetchCorpusFacets,
  runClaudeAnalysis,
  runClaudeRead,
  runManualFilter,
  type CorpusHoldings,
  type CorpusSpoke,
  type QueryMode,
} from '@lawfare/ragtime-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery, readDeepLink } from '@/lib/routing'
import { useOpenDeepLinkedDocument } from '@/lib/use-deep-link'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { type UsageLogRecord } from '@/lib/usage-log'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UsageLogAnnotation } from './components/UsageLogAnnotation'
import { ExportBar } from './components/ExportBar'
import { downloadCsv, fileSlug, type CsvColumn } from '@/lib/export-csv'
import { downloadNarrativePdf } from '@/lib/export-pdf'
import { LITIGATION_BASE_COLUMNS } from '@/lib/export-columns'
import { Breadcrumb } from './components/Breadcrumb'
import { CaseDetailSheet } from './components/CaseDetailSheet'
import { ClaudeAnalysisForm } from './components/ClaudeAnalysisForm'
import { ClaudeReadForm } from './components/ClaudeReadForm'
import { FilterForm } from './components/FilterForm'
import { ModeRow } from './components/ModeRow'
import { ResultsList } from './components/ResultsList'
import { SpokeHeader } from './components/SpokeHeader'
import {
  type StackPage,
  buildClaudeAnalysisLabel,
  buildClaudeReadLabel,
  buildManualFilterLabel,
} from './stack'

/**
 * Generic spoke renderer chassis (per the SPEC.md design rationale).
 *
 * v1.7 (PR 4h, this PR): stack runtime. Every operation pushes a
 * `StackPage`; the breadcrumb lets the user view past pages read-only.
 * The TIP (last page) is always the active scope for new operations.
 * Brief #6 §0 decision 1: "the stack literally instantiates the
 * auditability principle: the audit trail IS the navigable history of
 * operations."
 *
 * Stack affordances (breadcrumb, viewing-past banner) appear only after
 * the first operation lands — empty state is genuinely empty per the
 * brief's "rebuild fixes that wart" call-out.
 *
 * Data flow:
 *   - On mount: fetch /corpus/facets, populate holdings + dropdowns.
 *   - On any mode submit: build scope from `tipPage` (the current scope),
 *     run the Worker call, push a new page onto the stack.
 *   - Viewing past via the breadcrumb is strictly read-only — submits
 *     are guarded against viewing-past and the form is hidden behind a
 *     banner with a "return to current" affordance.
 *   - On mount/unmount: setActiveSpokeSlug() so the docs-overlay shows
 *     spoke-scoped entries.
 *
 * Litigation is served live from CourtListener (federate-api). A filter page
 * holds the newest rows loaded so far plus a cursor; "load more" on the tip
 * appends the next rows. Every later operation (a stacked filter, Read,
 * Analyze) runs over the loaded rows, and the page's `count` says how many
 * the full match set holds. AI-writes-SQL, AMA and more-like-this ran over
 * the retired mirror and are not offered here.
 */

export function SpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()
  // `byokConfigured` retained as a boolean for forms that gate on auth
  // availability — its meaning becomes "any AI auth is available", which
  // matches what the forms actually need. Renamed for clarity later if it
  // creates friction; for now the diff stays focused on auth wiring.
  const byokConfigured = auth.hasAuth

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
        const f = await fetchCorpusFacets()
        if (cancelled) return
        setFacets(f)
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

  // Hub → workspace carryover (`?q=`). Read once on mount; auto-run a manual
  // filter so we land on the responsive set, not the full corpus. The wired
  // effect lives below, after handleFilterSubmit is in scope.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  // A collection carried in the link (`?collection=<slug>`, e.g. from a
  // collection page's "Search inside"): seeds the form and joins the run.
  const carriedCollection = useMemo(() => {
    const c = readDeepLink()?.facets.collection?.[0]
    return c && /^[a-z0-9][a-z0-9-]{0,63}$/.test(c) ? c : null
  }, [])

  // Mode selection. manual_filter is always functional; AI modes become
  // available once a BYOK is configured. claude_read / claude_analysis
  // additionally require a populated tip scope.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')

  // ── Stack state ────────────────────────────────────────────────────────
  // The stack is the audit trail (brief #6 decision 1). Each operation
  // pushes a StackPage. `viewingIdx` lets the user read-only-browse past
  // pages via the breadcrumb; new operations always derive scope from
  // the tip (= `stack[stack.length - 1]`), not from the viewing page.
  const [stack, setStack] = useState<StackPage[]>([])
  const [viewingIdx, setViewingIdx] = useState<number>(-1)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  // Progress label for batched ops (claude_read). Empty during one-shot ops.
  const [progressLabel, setProgressLabel] = useState<string | undefined>(
    undefined,
  )

  // ── Derived stack state ────────────────────────────────────────────────
  const tipPage = stack.length > 0 ? stack[stack.length - 1] : undefined
  const viewingPage =
    viewingIdx >= 0 && viewingIdx < stack.length
      ? stack[viewingIdx]
      : undefined
  const isViewingTip = stack.length > 0 && viewingIdx === stack.length - 1
  const hasStack = stack.length > 0
  /** True when the user is browsing a past page (stack has entries AND
   *  viewing isn't the tip). Empty stack is NOT viewing-past — the form
   *  needs to render so the user can run their first operation. */
  const isViewingPast = hasStack && !isViewingTip
  const canSubmit = !isViewingPast

  // Scope size = tip's row count. AI modes (read/analysis) gate on this
  // because they operate on the active scope, not a past one.
  const scopeSize = tipPage?.rows.length ?? 0

  // Keyword-match snippets ride along on the filter response (CourtListener's
  // own highlighting), stored per page — no lazy per-page fetch.
  const snippets = viewingPage?.snippets ?? {}

  /** Push a new page onto the stack and move viewing to it. */
  function pushPage(p: Omit<StackPage, 'id'>) {
    const newPage: StackPage = { ...p, id: crypto.randomUUID() }
    setStack((prev) => [...prev, newPage])
    setViewingIdx(stack.length) // new tip index
  }

  /** Enter read-only view of a past page. -1 = the implicit "all cases"
   *  root (no page rendered; just the breadcrumb). */
  function viewPast(idx: number) {
    setViewingIdx(idx)
  }

  /** Return to the tip — the active scope for new operations. */
  function returnToTip() {
    setViewingIdx(stack.length - 1)
  }

  /** Build the scope payload for /corpus/filter from the tip's loaded id-set.
   *  Empty stack → empty scope (full corpus). The Worker ANDs the ids into the
   *  CourtListener query and refuses a scope over its id cap by name
   *  (scope_too_large), which surfaces as the query error. */
  function buildScopeFromTip(): FilterScope {
    if (!tipPage) return {}
    const ids = tipPage.clIds ?? tipPage.rows.map((r) => r.cl_id)
    if (ids.length === 0) return {}
    return { cl_ids: ids }
  }

  const enabledModes = useMemo<QueryMode[]>(() => {
    const enabled: QueryMode[] = ['manual_filter']
    if (byokConfigured && scopeSize > 0) enabled.push('claude_read')
    // Analyze stays selectable over its cap: at 150 cases the cap is hit by
    // two loaded pages, and the form explains it (narrow first) where a
    // disabled tab would only say "soon".
    if (byokConfigured && scopeSize > 0) enabled.push('claude_analysis')
    return enabled
  }, [byokConfigured, scopeSize])

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleFilterSubmit(fields: FilterFields) {
    if (!canSubmit) return
    setQueryLoading(true)
    setQueryError(undefined)
    setLoadMoreError(undefined)
    try {
      const scope = buildScopeFromTip()
      const r = await runManualFilter(fields, scope)
      pushPage({
        operationType: 'manual_filter',
        operationLabel: buildManualFilterLabel(fields),
        rows: r.display_rows,
        count: r.count,
        clIds: r.cl_ids,
        source: { kind: 'manual_filter', generatedSql: r.generated_sql },
        paging: { fields, scope, cursor: r.next_cursor ?? null },
        snippets: snippetMap(r),
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
    } finally {
      setQueryLoading(false)
    }
  }

  // "Load more": fetch the next CourtListener rows for the tip and append
  // them in place. Tip-only, because every later page was derived from the
  // rows a page held when it ran; growing a past page would rewrite that
  // record under it.
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>(
    undefined,
  )
  const canLoadMore =
    isViewingTip && !!tipPage?.paging?.cursor && !queryLoading

  async function handleLoadMore() {
    const tip = tipPage
    const paging = tip?.paging
    if (!tip || !paging?.cursor || !isViewingTip) return
    setLoadingMore(true)
    setLoadMoreError(undefined)
    try {
      const r = await runManualFilter(paging.fields, paging.scope, paging.cursor)
      setStack((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.id !== tip.id) return prev
        const seen = new Set(last.rows.map((row) => row.cl_id))
        const fresh = r.display_rows.filter((row) => !seen.has(row.cl_id))
        const rows = [...last.rows, ...fresh]
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            rows,
            count: r.count,
            clIds: rows.map((row) => row.cl_id),
            paging: { ...paging, cursor: r.next_cursor ?? null },
            snippets: { ...last.snippets, ...snippetMap(r) },
          },
        ]
      })
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  // Run the hub-carried keyword as a manual filter, once, on mount. Ref-guarded
  // so React StrictMode's double-invoke (dev) doesn't push two pages.
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || (!carryover && !carriedCollection)) return
    carriedOverRef.current = true
    // Mirror the filter form's defaults: all courts (omitting `allCourts`
    // would scope to zero courts → zero rows) and no date floor.
    void handleFilterSubmit({
      ...(carryover ? { search: carryover } : {}),
      ...(carriedCollection ? { collection: carriedCollection } : {}),
      allCourts: true,
    })
    // Mount-only: handleFilterSubmit + carryover are stable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectMode(m: QueryMode) {
    setActiveMode(m)
  }

  async function handleClaudeReadSubmit(criterion: string) {
    if (!canSubmit) return
    if (!auth.auth) {
      setQueryError('Configure AI access (header, top right) first.')
      return
    }
    if (!tipPage || tipPage.rows.length === 0) return
    const incomingIds = tipPage.rows.map((r) => r.cl_id)
    const incomingMap = new Map(tipPage.rows.map((r) => [r.cl_id, r]))
    setQueryLoading(true)
    setQueryError(undefined)
    setProgressLabel(`Reading 0 / ${incomingIds.length.toLocaleString()} cases…`)
    try {
      const { verdicts } = await runClaudeRead({
        criterion,
        clIds: incomingIds,
        auth: auth.auth,
        onProgress: (done, total) => {
          setProgressLabel(
            `Reading ${done.toLocaleString()} / ${total.toLocaleString()} cases…`,
          )
        },
      })
      const keptRows = incomingIds
        .filter((id) => verdicts[id]?.keep)
        .map((id) => incomingMap.get(id))
        .filter((r): r is CaseDisplayRow => r != null)
      pushPage({
        operationType: 'claude_read',
        operationLabel: buildClaudeReadLabel(criterion),
        rows: keptRows,
        count: keptRows.length,
        clIds: keptRows.map((r) => r.cl_id),
        source: {
          kind: 'claude_read',
          criterion,
          incomingCount: incomingIds.length,
          keptCount: keptRows.length,
          verdicts,
        },
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
    } finally {
      setQueryLoading(false)
      setProgressLabel(undefined)
    }
  }

  async function handleClaudeAnalysisSubmit(prompt: string) {
    if (!canSubmit) return
    if (!auth.auth) {
      setQueryError('Configure AI access (header, top right) first.')
      return
    }
    if (!tipPage || tipPage.rows.length === 0) return
    const incomingIds = tipPage.rows.map((r) => r.cl_id)
    setQueryLoading(true)
    setQueryError(undefined)
    try {
      const r = await runClaudeAnalysis(prompt, incomingIds, auth.auth)
      if (typeof r._balance_cents === 'number') {
        paid.applyBalanceFromWorker(r._balance_cents)
      }
      // Analyze never narrows — re-fetched rows from the Worker are
      // authoritative (consistent order with SQL_DISPLAY_COLS).
      pushPage({
        operationType: 'claude_analysis',
        operationLabel: buildClaudeAnalysisLabel(prompt),
        rows: r.cases,
        count: r.cases.length,
        clIds: r.cases.map((c) => c.cl_id),
        source: {
          kind: 'claude_analysis',
          prompt,
          markdown: r.markdown,
          annotations: r.annotations,
          analyzedCount: r.cases.length,
        },
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
    } finally {
      setQueryLoading(false)
    }
  }

  // ── Case-detail state ──────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false)
  const [openCase, setOpenCase] = useState<CaseDisplayRow | null>(null)

  function handleOpenCase(row: CaseDisplayRow) {
    setOpenCase(row)
    setDetailOpen(true)
  }

  /** Open a case by id (a deep link) in the detail sheet — resolve the cl_id
   *  to a full row, same path as a results-list open. */
  async function handleOpenCaseById(id: string) {
    try {
      const rows = await fetchCasesByIds([Number(id)])
      if (rows.length > 0) handleOpenCase(rows[0])
    } catch {
      // Best-effort.
    }
  }

  // Explorer document handoff (`/corpus/litigation/<cl_id>`, the target of
  // an `rt://` citation): open the case sheet once on mount.
  useOpenDeepLinkedDocument((doc) => handleOpenCaseById(doc.id))

  /** Discard the tip (the last operation) and return to the previous layer —
   *  the scope from which it was derived becomes active again. Restores the
   *  legacy "← Back to previous page" affordance lost in the React port. The
   *  discarded layer's results are not saved. */
  function popTip() {
    if (stack.length === 0) return
    const tip = stack[stack.length - 1]
    const ok = window.confirm(
      `Discard this layer — ${tip.operationLabel} — and return to the previous scope?\n\n` +
        `The discarded layer's results are not saved.`,
    )
    if (!ok) return
    setStack((prev) => prev.slice(0, -1))
    setViewingIdx(stack.length - 2) // new tip; -1 when the stack becomes empty (= All cases)
    setActiveMode('manual_filter')
    setQueryError(undefined)
    setLoadMoreError(undefined)
    setDetailOpen(false)
    setOpenCase(null)
  }

  /** Discard the entire stack and return to the "All cases" root — a fresh
   *  session. Restores the legacy "Reset session" affordance. */
  function resetSession() {
    if (
      stack.length > 0 &&
      !window.confirm(
        `Reset session? This discards all ${stack.length} exploration layer(s).`,
      )
    ) {
      return
    }
    setStack([])
    setViewingIdx(-1)
    setActiveMode('manual_filter')
    setQueryError(undefined)
    setDetailOpen(false)
    setOpenCase(null)
    setLoadMoreError(undefined)
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
        onSelect={selectMode}
        docSlug="litigation-modes"
      />
      {hasStack && (
        <Breadcrumb
          stack={stack}
          viewingIdx={viewingIdx}
          onViewPast={viewPast}
          onReturnToTip={returnToTip}
          onPopTip={popTip}
          onReset={resetSession}
        />
      )}
      {isViewingPast && (
        <ViewingPastBanner onReturnToTip={returnToTip} />
      )}
      {/* Forms — visible only when on the tip. Viewing past is read-only;
       *  the banner above gives the user a one-click way back. */}
      {canSubmit && activeMode === 'manual_filter' && (
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
          initialSearch={carryover ?? undefined}
          initialCollection={carriedCollection ?? undefined}
        />
      )}
      {canSubmit && activeMode === 'claude_read' && (
        <ClaudeReadForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          scopeSize={scopeSize}
          progressLabel={progressLabel}
          onSubmit={handleClaudeReadSubmit}
        />
      )}
      {canSubmit && activeMode === 'claude_analysis' && (
        <ClaudeAnalysisForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          scopeSize={scopeSize}
          onSubmit={handleClaudeAnalysisSubmit}
        />
      )}
      {viewingPage && !queryLoading && (
        <ExportBar
          onCsv={
            viewingPage.rows.length > 0
              ? () => downloadLitigationCsv(viewingPage)
              : undefined
          }
          onPdf={
            litigationNarrative(viewingPage) != null
              ? () => downloadLitigationPdf(viewingPage, spoke.title)
              : undefined
          }
        />
      )}
      <ResultsList
        rows={viewingPage?.rows}
        count={viewingPage?.count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasStack}
        source={viewingPage?.source}
        snippets={snippets}
        onOpenCase={handleOpenCase}
        loadMore={
          viewingPage?.paging?.cursor && isViewingTip
            ? {
                onLoadMore: handleLoadMore,
                disabled: !canLoadMore,
                loading: loadingMore,
                error: loadMoreError,
              }
            : undefined
        }
      />
      {viewingPage && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={litigationRecordFromPage(viewingPage)}
        />
      )}
      <CaseDetailSheet
        case={openCase}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

/**
 * The narrative markdown carried by a stack page, if any. Analysis pages carry
 * `markdown`; AMA pages carry `answerMarkdown`. Other operations have none.
 */
function litigationNarrative(page: StackPage): string | null {
  const s = page.source
  if (s.kind === 'claude_analysis') return s.markdown || null
  if (s.kind === 'claude_ama') return s.answerMarkdown || null
  return null
}

/**
 * Build the CSV column set for a litigation page. Base case columns, plus
 * per-operation columns: the keep/drop verdict + reason for `claude_read`, and
 * whichever of rank/score/category/label the model actually populated for
 * `claude_analysis`. Mirrors the legacy `downloadCurrentPage()` behavior.
 */
function litigationCsvColumns(page: StackPage): CsvColumn<CaseDisplayRow>[] {
  const s = page.source
  const cols: CsvColumn<CaseDisplayRow>[] = [...LITIGATION_BASE_COLUMNS]
  if (s.kind === 'claude_read') {
    cols.push({ header: 'kept', value: (r) => (s.verdicts[r.cl_id]?.keep ? 'true' : 'false') })
    cols.push({ header: 'ai_reason', value: (r) => s.verdicts[r.cl_id]?.reason ?? '' })
  }
  if (s.kind === 'claude_analysis') {
    const ann = s.annotations
    const has = (f: 'rank' | 'score' | 'category' | 'label') =>
      page.rows.some((r) => ann[r.cl_id]?.[f] != null)
    if (has('rank')) cols.push({ header: 'rank', value: (r) => ann[r.cl_id]?.rank })
    if (has('score')) cols.push({ header: 'score', value: (r) => ann[r.cl_id]?.score })
    if (has('category'))
      cols.push({ header: 'category', value: (r) => ann[r.cl_id]?.category })
    if (has('label')) cols.push({ header: 'label', value: (r) => ann[r.cl_id]?.label })
  }
  return cols
}

function litigationCsvMeta(page: StackPage): { key: string; value: unknown }[] {
  const s = page.source
  const meta: { key: string; value: unknown }[] = [
    { key: 'operation', value: page.operationType },
    { key: 'label', value: page.operationLabel },
    { key: 'count', value: page.count },
  ]
  switch (s.kind) {
    case 'manual_filter':
      meta.push({ key: 'generated_sql', value: s.generatedSql })
      break
    case 'claude_sql':
      meta.push({ key: 'prompt', value: s.prompt })
      meta.push({ key: 'generated_sql', value: s.generatedSql })
      break
    case 'claude_read':
      meta.push({ key: 'criterion', value: s.criterion })
      meta.push({ key: 'incoming_count', value: s.incomingCount })
      meta.push({ key: 'kept_count', value: s.keptCount })
      break
    case 'claude_analysis':
      meta.push({ key: 'prompt', value: s.prompt })
      break
    case 'claude_ama':
      meta.push({ key: 'question', value: s.question })
      meta.push({ key: 'plan', value: s.planSummary })
      break
  }
  return meta
}

function downloadLitigationCsv(page: StackPage): void {
  downloadCsv<CaseDisplayRow>(`ragtime-litigation-${fileSlug(page.operationLabel)}.csv`, {
    title: 'RAGtime — litigation export',
    meta: litigationCsvMeta(page),
    narrativeMarkdown: litigationNarrative(page) ?? undefined,
    columns: litigationCsvColumns(page),
    rows: page.rows,
  })
}

function downloadLitigationPdf(page: StackPage, spokeTitle: string): void {
  const markdown = litigationNarrative(page)
  if (!markdown) return
  const s = page.source
  const prompt =
    s.kind === 'claude_ama'
      ? s.question
      : s.kind === 'claude_analysis'
        ? s.prompt
        : '(no prompt recorded)'
  const scopeCount =
    s.kind === 'claude_ama'
      ? s.incomingCount
      : s.kind === 'claude_analysis'
        ? s.analyzedCount
        : page.count
  downloadNarrativePdf({
    title: 'RAGtime Analysis',
    subtitle: spokeTitle,
    metaRows: [
      { key: 'Prompt', value: prompt },
      { key: 'Scope', value: `${scopeCount.toLocaleString()} case${scopeCount === 1 ? '' : 's'} analyzed` },
    ],
    markdown,
  })
}

/**
 * Map a litigation stack page → usage-log record (INTERNAL logging tool, see
 * @/lib/usage-log — strip before release). Reuses the page's stable id as the
 * interaction id, so re-logging the same page upserts one row. Covers every
 * litigation operation (filter / sql / read / analyze / ama).
 */
function litigationRecordFromPage(page: StackPage): UsageLogRecord {
  const s = page.source
  const base = {
    interaction_id: page.id,
    surface: 'litigation',
    question: page.operationLabel,
    cited_ids: page.rows.map((r) => r.cl_id),
  }
  switch (s.kind) {
    case 'manual_filter':
      return { ...base, mode: 'manual_filter', plan: { generated_sql: s.generatedSql } }
    case 'claude_sql':
      return {
        ...base,
        mode: 'sql',
        question: s.prompt,
        plan: { generated_sql: s.generatedSql, label: s.label },
      }
    case 'claude_read':
      return {
        ...base,
        mode: 'read',
        question: s.criterion,
        plan: { incoming_count: s.incomingCount, kept_count: s.keptCount },
      }
    case 'claude_analysis':
      return {
        ...base,
        mode: 'analyze',
        question: s.prompt,
        answer_markdown: s.markdown,
      }
    case 'claude_ama':
      return {
        ...base,
        mode: 'ama',
        question: s.question,
        output_mode: s.outputMode,
        answer_markdown: s.answerMarkdown,
        candor_notes: s.candorNotes,
        plan: { approach_summary: s.planSummary },
      }
  }
  return { ...base, mode: 'manual_filter' } // unreachable; exhaustive above
}

/**
 * Banner shown when the user is browsing a past stack page. The breadcrumb
 * already has a "Return to current" button on the right; this banner makes
 * the read-only state unmistakable above the result area.
 */
function ViewingPastBanner({ onReturnToTip }: { onReturnToTip: () => void }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-between gap-4 border-b border-amber-400/40',
        'bg-amber-500/10 px-6 py-2 text-xs text-amber-900 dark:text-amber-200',
      )}
    >
      <span>
        Viewing a past page (read-only). Return to the current page to run
        new operations.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onReturnToTip}
        className="h-7 border-amber-400/60 text-xs"
      >
        Return to current
      </Button>
    </div>
  )
}

/** A filter response's snippets, re-keyed by numeric cl_id. */
function snippetMap(r: FilterResult): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [k, v] of Object.entries(r.snippets ?? {})) {
    if (typeof v === 'string' && v) out[Number(k)] = v
  }
  return out
}
