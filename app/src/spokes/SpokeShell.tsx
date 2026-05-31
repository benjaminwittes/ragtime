import { useEffect, useMemo, useState } from 'react'
import {
  AMA_CONFIRM_THRESHOLD_CENTS,
  ANALYSIS_HARD_CAP,
  type AmaPlan,
  type AmaScope,
  type CaseDisplayRow,
  type CorpusFacets,
  type FilterFields,
  type FilterScope,
  WorkerSqlError,
  fetchCasesByIds,
  fetchCorpusFacets,
  runClaudeAnalysis,
  runClaudeExecute,
  runClaudePlan,
  runClaudeRead,
  runClaudeSql,
  runManualFilter,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { type UsageLogRecord } from '@/lib/usage-log'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AmaPreflight } from './components/AmaPreflight'
import { UsageLogAnnotation } from './components/UsageLogAnnotation'
import { Breadcrumb } from './components/Breadcrumb'
import { CaseDetailSheet } from './components/CaseDetailSheet'
import { ClaudeAmaForm, type AmaLogLine } from './components/ClaudeAmaForm'
import { ClaudeAnalysisForm } from './components/ClaudeAnalysisForm'
import { ClaudeReadForm } from './components/ClaudeReadForm'
import { ClaudeSqlForm } from './components/ClaudeSqlForm'
import { FilterForm } from './components/FilterForm'
import { ModeRow } from './components/ModeRow'
import { ResultsList } from './components/ResultsList'
import { SpokeHeader } from './components/SpokeHeader'
import {
  type StackPage,
  buildClaudeAmaLabel,
  buildClaudeAnalysisLabel,
  buildClaudeReadLabel,
  buildClaudeSqlLabel,
  buildManualFilterLabel,
} from './stack'
import type {
  CorpusHoldings,
  CorpusSpoke,
  QueryMode,
} from './types'

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

  /** Build the scope payload for /corpus/filter and /corpus/sql from the
   *  tip's row IDs. Empty stack → empty scope (full corpus). */
  function buildScopeFromTip(): FilterScope {
    if (!tipPage || tipPage.rows.length === 0) return {}
    return { cl_ids: tipPage.rows.map((r) => r.cl_id) }
  }

  const enabledModes = useMemo<QueryMode[]>(() => {
    const enabled: QueryMode[] = ['manual_filter']
    if (byokConfigured) enabled.push('claude_sql')
    if (byokConfigured && scopeSize > 0) enabled.push('claude_read')
    if (
      byokConfigured &&
      scopeSize > 0 &&
      scopeSize <= ANALYSIS_HARD_CAP
    ) {
      enabled.push('claude_analysis')
    }
    // claude_ama is BYOK-only; it operates on the current scope OR the full
    // corpus, so it has no scope gate. The pre-flight modal handles cost.
    if (byokConfigured) enabled.push('claude_ama')
    return enabled
  }, [byokConfigured, scopeSize])

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleFilterSubmit(fields: FilterFields) {
    if (!canSubmit) return
    setQueryLoading(true)
    setQueryError(undefined)
    try {
      const r = await runManualFilter(fields, buildScopeFromTip())
      pushPage({
        operationType: 'manual_filter',
        operationLabel: buildManualFilterLabel(fields),
        rows: r.display_rows,
        count: r.count,
        source: { kind: 'manual_filter', generatedSql: r.generated_sql },
      })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
    } finally {
      setQueryLoading(false)
    }
  }

  async function handleClaudeSqlSubmit(prompt: string) {
    if (!canSubmit) return
    if (!auth.auth) {
      setQueryError('Configure AI access (header, top right) first.')
      return
    }
    setQueryLoading(true)
    setQueryError(undefined)
    try {
      const r = await runClaudeSql(
        { prompt, scope: buildScopeFromTip() },
        auth.auth,
      )
      if (typeof r._balance_cents === 'number') {
        paid.applyBalanceFromWorker(r._balance_cents)
      }
      pushPage({
        operationType: 'claude_sql',
        operationLabel: buildClaudeSqlLabel(prompt, r.label),
        rows: r.display_rows,
        count: r.count,
        source: {
          kind: 'claude_sql',
          prompt,
          label: r.label,
          generatedSql: r.generated_sql,
        },
      })
    } catch (e) {
      if (e instanceof WorkerSqlError) {
        setQueryError(e.message)
        // Brief #6 §7b item 3 — surface the generated SQL even on
        // failure. We DON'T push a page for failures (the audit trail
        // captures successful operations only); the error and SQL
        // surface inline on the current view.
      } else {
        setQueryError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setQueryLoading(false)
    }
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

  // ── AMA orchestrator ───────────────────────────────────────────────────
  // The pre-flight modal is gated by `pendingPlan` — when non-null, the
  // modal is shown and the user must confirm before /corpus/execute fires.
  // `amaLog` drives the inline session log on the form.
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: AmaPlan
    question: string
    /** Snapshot of the tip's rows at submission time. Used to filter the
     *  kept set locally when AMA narrows over an existing scope; null when
     *  AMA ran against the full corpus. */
    incomingRows: CaseDisplayRow[] | null
  } | null>(null)

  function appendAmaLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  /** Build the AMA scope payload from the tip. No tip = run against full
   *  corpus. Mirrors buildAmaScopeSummary() in legacy index.html. */
  function buildAmaScope(): AmaScope {
    if (!tipPage || tipPage.rows.length === 0) {
      return {
        is_full_db: true,
        count: facets?.case_count ?? 0,
        description: `The full corpus${facets ? ' (' + facets.case_count.toLocaleString() + ' cases)' : ''} across all federal courts.`,
      }
    }
    return {
      cl_ids: tipPage.rows.map((r) => r.cl_id),
      is_full_db: false,
      count: tipPage.rows.length,
      description: `${tipPage.rows.length.toLocaleString()} cases from the current page.`,
    }
  }

  async function handleClaudeAmaSubmit(question: string) {
    if (!canSubmit) return
    if (!auth.auth) {
      setQueryError('Configure AI access (header, top right) first.')
      return
    }
    setQueryLoading(true)
    setQueryError(undefined)
    setAmaLog([])
    appendAmaLog({ label: 'Step 1/3.', message: 'Planning the query…' })
    const scope = buildAmaScope()
    const incomingRowsSnapshot = tipPage?.rows ?? null
    let plan: AmaPlan
    try {
      plan = await runClaudePlan(question, scope, auth.auth)
      if (typeof plan._balance_cents === 'number') {
        paid.applyBalanceFromWorker(plan._balance_cents)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendAmaLog({ label: 'Plan failed.', message: msg, status: 'error' })
      setQueryError(msg)
      setQueryLoading(false)
      return
    }
    appendAmaLog({
      label: 'Plan.',
      message: `${plan.output_mode} · ${plan.queries.length} quer${plan.queries.length === 1 ? 'y' : 'ies'} · est. ${fmtCents(plan.estimated_cost_cents)}`,
      status: 'done',
    })

    if (plan.estimated_cost_cents > AMA_CONFIRM_THRESHOLD_CENTS) {
      setPendingPlan({
        plan,
        question,
        incomingRows: incomingRowsSnapshot,
      })
      return
    }
    await runAmaExecute(plan, question, incomingRowsSnapshot)
  }

  async function runAmaExecute(
    plan: AmaPlan,
    question: string,
    incomingRowsSnapshot: CaseDisplayRow[] | null,
  ) {
    if (!auth.auth) return
    appendAmaLog({ label: 'Step 2/3.', message: 'Executing planned queries…' })
    try {
      const synth = await runClaudeExecute(plan.token, auth.auth)
      if (typeof synth._balance_cents === 'number') {
        paid.applyBalanceFromWorker(synth._balance_cents)
      }
      appendAmaLog({
        label: 'Step 3/3.',
        message: 'Synthesized the answer.',
        status: 'done',
      })

      // Empty or null incoming rows = full corpus.
      const incomingCount =
        incomingRowsSnapshot && incomingRowsSnapshot.length > 0
          ? incomingRowsSnapshot.length
          : (facets?.case_count ?? 0)
      let outRows: CaseDisplayRow[]
      let narrowed = false
      const wantsList =
        synth.output_mode === 'list' || synth.output_mode === 'hybrid'
      if (wantsList && synth.cl_ids && synth.cl_ids.length > 0) {
        narrowed = true
        if (incomingRowsSnapshot && incomingRowsSnapshot.length > 0) {
          const incomingMap = new Map(
            incomingRowsSnapshot.map((r) => [r.cl_id, r]),
          )
          outRows = synth.cl_ids
            .map((id) => incomingMap.get(id))
            .filter((r): r is CaseDisplayRow => r != null)
        } else {
          outRows = await fetchCasesByIds(synth.cl_ids.slice(0, 10000))
        }
      } else {
        // Narrative-only — rows pass through. Empty for full-corpus
        // narrative answers (the agent's narrative is the whole result).
        outRows = incomingRowsSnapshot ?? []
      }

      const allCandor = dedupe([
        ...(plan.candor_notes ?? []),
        ...(synth.candor_notes ?? []),
      ])

      pushPage({
        operationType: 'claude_ama',
        operationLabel: buildClaudeAmaLabel(question),
        rows: outRows,
        count: outRows.length,
        source: {
          kind: 'claude_ama',
          question,
          outputMode: synth.output_mode,
          planSummary: plan.approach_summary,
          candorNotes: allCandor,
          answerMarkdown: synth.answer_markdown,
          incomingCount,
          outgoingCount: outRows.length,
          narrowed,
        },
      })
      const total = (plan._cost_cents ?? 0) + (synth._cost_cents ?? 0)
      if (total > 0) {
        appendAmaLog({
          label: 'Done.',
          message: `Total spent: ${fmtCents(total)}`,
          status: 'done',
        })
      } else {
        appendAmaLog({ label: 'Done.', message: '', status: 'done' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendAmaLog({ label: 'Execute failed.', message: msg, status: 'error' })
      setQueryError(msg)
    } finally {
      setQueryLoading(false)
    }
  }

  async function handleAmaProceed() {
    if (!pendingPlan) return
    const { plan, question, incomingRows } = pendingPlan
    setPendingPlan(null)
    await runAmaExecute(plan, question, incomingRows)
  }

  function handleAmaCancel() {
    if (!pendingPlan) return
    appendAmaLog({
      label: 'Cancelled.',
      message: 'User cancelled at pre-flight.',
      status: 'error',
    })
    setPendingPlan(null)
    setQueryLoading(false)
  }

  // ── Case-detail state ──────────────────────────────────────────────────
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
      {hasStack && (
        <Breadcrumb
          stack={stack}
          viewingIdx={viewingIdx}
          onViewPast={viewPast}
          onReturnToTip={returnToTip}
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
        />
      )}
      {canSubmit && activeMode === 'claude_sql' && (
        <ClaudeSqlForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          onSubmit={handleClaudeSqlSubmit}
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
      {canSubmit && activeMode === 'claude_ama' && (
        <ClaudeAmaForm
          loading={queryLoading}
          byokConfigured={byokConfigured}
          scopeSize={scopeSize}
          log={amaLog}
          onSubmit={handleClaudeAmaSubmit}
        />
      )}
      <ResultsList
        rows={viewingPage?.rows}
        count={viewingPage?.count}
        loading={queryLoading}
        error={queryError}
        hasRun={hasStack}
        source={viewingPage?.source}
        onOpenCase={handleOpenCase}
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
      <AmaPreflight
        plan={pendingPlan?.plan ?? null}
        open={!!pendingPlan}
        onProceed={handleAmaProceed}
        onCancel={handleAmaCancel}
        paidAccount={auth.isPaid ? paid.account : null}
      />
    </div>
  )
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

/** Compact cent → dollars/cents formatter. <100¢ stays in cents for the
 *  low-cost-per-step UX; ≥100¢ flips to dollars. */
function fmtCents(c: number | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(1)}¢`
  return `$${(c / 100).toFixed(2)}`
}

/** Stable de-duplication for candor notes. */
function dedupe(xs: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}
