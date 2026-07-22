import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type FbiAmaPlan,
  type FbiAmaScope,
  type FbiAmaSynthesis,
  type FbiFacets,
  type FbiFilterFields,
  type FbiFilterResult,
  type FbiDocumentDisplayRow,
  type SemanticSearchRow,
  fetchFbiFacets,
  fetchFbiItemsByIds,
  runFbiExecute,
  runFbiFilter,
  runFbiPlan,
  runSemanticSearch,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { isAmaPreflightSkipped } from '@/lib/ama-preflight-skip'
import type { CorpusHoldings, CorpusSpoke, QueryMode } from '../types'
import { AmaPreflight } from '../components/AmaPreflight'
import { BackToHubLink } from '../components/BackToHubLink'
import { ClaudeAmaForm, type AmaLogLine } from '../components/ClaudeAmaForm'
import { ExportBar } from '../components/ExportBar'
import { ModeRow } from '../components/ModeRow'
import { SearchModeToggle, type SearchMode } from '../components/SearchModeToggle'
import {
  ResultsPaneHeader,
  SemanticResultsList,
} from '../components/SemanticResultsList'
import { UsageLogAnnotation } from '../components/UsageLogAnnotation'
import { downloadCsv } from '@/lib/export-csv'
import { downloadNarrativePdf } from '@/lib/export-pdf'
import { FBI_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { useMoreLikeThis, type MltSeed } from '../more-like-this/useMoreLikeThis'
import { MoreLikeThisPrompt } from '../more-like-this/MoreLikeThisPrompt'
import { MoreLikeThisView } from '../more-like-this/MoreLikeThisView'
import { FbiAmaResult } from './FbiAmaResult'
import { FbiFilterForm } from './FbiFilterForm'
import { FbiDocumentDetailSheet } from './FbiDocumentDetailSheet'
import { FbiResultsList } from './FbiResultsList'

/**
 * FBI Records spoke shell (brief #14). Two query modes:
 *  - manual_filter: FTS + collection typeahead + provenance facet, with the
 *    keyword/semantic/both toggle (the corpus arrived fully embedded) and a
 *    document detail sheet whose provenance block surfaces the Wayback
 *    story for recovered documents.
 *  - claude_ama: plan→execute→synthesize over fbi_documents — collection
 *    questions, removed-document questions, topical search across the OCR
 *    text. The Worker planner carries the corpus's candor stack (no
 *    document dates, OCR quality, Wayback provenance, Vault-as-preserved
 *    coverage).
 *
 * "Summarize this document" lives on the detail sheet, not in the mode
 * selector. Scope for AMA: filter results narrow the corpus when present.
 * There is NO date UI anywhere in this shell — doc_date is NULL corpus-wide
 * (unique among spokes), and the header's coverage tile says so instead of
 * showing a date range.
 */
export function FbiSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<FbiFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchFbiFacets()
        if (cancelled) return
        setFacets(f)
        const live = f.provenance.find((p) => p.value === 'live')?.count ?? 0
        const recovered =
          f.provenance.find((p) => p.value === 'wayback-recovered')?.count ?? 0
        const h: CorpusHoldings = {
          counts: { documents: f.document_count, collections: f.collection_count },
          // No date coverage exists for this corpus (doc_date NULL corpus-wide)
          // — the header tiles show counts instead of a date window.
          coverage: 'no document dates',
          lastUpdated: '—',
          provenance: {
            live,
            recovered,
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

  // Filter state.
  const [rows, setRows] = useState<FbiDocumentDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [filterIds, setFilterIds] = useState<number[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // Semantic pane state (brief #9) — live day one; the corpus arrived embedded.
  const [searchMode, setSearchMode] = useState<SearchMode>('both')
  const [semRows, setSemRows] = useState<SemanticSearchRow[] | undefined>(undefined)
  const [semLoading, setSemLoading] = useState(false)
  const [semError, setSemError] = useState<string | undefined>(undefined)
  const [semHasRun, setSemHasRun] = useState(false)
  const [semOpeningId, setSemOpeningId] = useState<string | null>(null)

  // AMA state.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: FbiAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<FbiAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<FbiAmaPlan | null>(null)
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): FbiAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.document_count ?? 10746
      // No description on the full-corpus scope — the Worker's default scope
      // line carries the no-document-dates candor, and we don't override it.
      return {
        is_full_db: true,
        count: total,
      }
    }
    return {
      document_ids: filterIds,
      is_full_db: false,
      count: filterIds.length,
      description: `${filterIds.length.toLocaleString()} documents from the current filter.`,
    }
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const [openDocument, setOpenDocument] =
    useState<FbiDocumentDisplayRow | null>(null)

  function handleOpenDocument(row: FbiDocumentDisplayRow) {
    setOpenDocument(row)
    setDetailOpen(true)
  }

  // Hub → workspace carryover (`?q=`).
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(fields: FbiFilterFields) {
    const wantKeyword = searchMode !== 'semantic'
    const wantSemantic =
      spoke.semanticSearch === true &&
      searchMode !== 'keyword' &&
      !!fields.search?.trim()
    if (searchMode === 'semantic' && !wantSemantic) {
      setSemHasRun(true)
      setSemRows([])
      setSemError(
        'Semantic search needs search text — add words to the search field. (Structured filters alone run in Keyword mode.)',
      )
      return
    }
    await Promise.all([
      wantKeyword ? runKeywordPane(fields) : Promise.resolve(),
      wantSemantic
        ? runSemanticPane(fields.search!.trim())
        : Promise.resolve(clearSemanticPane()),
    ])
  }

  async function runKeywordPane(fields: FbiFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: FbiFilterResult = await runFbiFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'fbi',
          mode: 'manual_filter',
          question:
            fields.search ?? fields.collection ?? fields.provenance ?? '(structured filter)',
          plan: { fields, executed_sql: r.executed_sql, search_mode: searchMode },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setFilterIds([])
      setExecutedSql(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  function clearSemanticPane() {
    setSemRows(undefined)
    setSemError(undefined)
    setSemHasRun(false)
  }

  async function runSemanticPane(query: string) {
    setSemLoading(true)
    setSemError(undefined)
    setSemHasRun(true)
    try {
      const r = await runSemanticSearch('fbi', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'fbi',
          mode: 'semantic_search',
          question: query,
          plan: { search_mode: searchMode },
          cited_ids: r.results.map((row) => row.id),
        },
        auth.auth,
      )
    } catch (e) {
      setSemError(e instanceof Error ? e.message : String(e))
      setSemRows([])
    } finally {
      setSemLoading(false)
    }
  }

  async function handleOpenSemanticResult(row: SemanticSearchRow) {
    setSemOpeningId(row.id)
    try {
      const full = await fetchFbiItemsByIds([Number(row.id)])
      if (full.length > 0) handleOpenDocument(full[0])
    } catch {
      // Detail open is best-effort; the card simply stays closed.
    } finally {
      setSemOpeningId(null)
    }
  }

  // ── "More like this" pivot stack (briefs §3) ───────────────────────────
  const [mltOpeningId, setMltOpeningId] = useState<string | null>(null)
  const mlt = useMoreLikeThis({
    slug: 'fbi',
    auth: auth.auth,
    stashedLabel: 'FBI Records search',
    onBalance: paid.applyBalanceFromWorker,
    onResult: (page) => {
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'fbi',
          mode: 'more_like_this',
          question: page.prompt || '(overall similarity)',
          plan: {
            seed_id: page.seed.id,
            route: page.result.route,
            lens: page.result.lens,
            query: page.result.query,
          },
          cited_ids: page.result.results.map((r) => r.id),
          cost_cents: page.result._cost_cents,
        },
        auth.auth,
      )
    },
  })

  function handleMoreLikeThis(seed: MltSeed) {
    setDetailOpen(false)
    mlt.requestPivot(seed)
  }

  async function handleOpenMltResult(id: string) {
    setMltOpeningId(id)
    try {
      const full = await fetchFbiItemsByIds([Number(id)])
      if (full.length > 0) handleOpenDocument(full[0])
    } catch {
      // Best-effort.
    } finally {
      setMltOpeningId(null)
    }
  }

  const keywordIdSet = useMemo(
    () => new Set(filterIds.map((id) => String(id))),
    [filterIds],
  )
  const semanticIdSet = useMemo(
    () => new Set((semRows ?? []).map((r) => r.id)),
    [semRows],
  )
  const showKeywordPane = searchMode !== 'semantic'
  const showSemanticPane =
    spoke.semanticSearch === true && searchMode !== 'keyword' && (semHasRun || semLoading)
  const panesSideBySide = showKeywordPane && showSemanticPane

  async function handleClaudeAmaSubmit(question: string) {
    if (!auth.auth) {
      setAmaError('Configure AI access (header, top right) first.')
      return
    }
    setAmaLoading(true)
    setAmaError(undefined)
    setAmaLog([])
    setAmaSynthesis(null)
    setAmaResultPlan(null)
    appendLog({ label: 'Step 1/3.', message: 'Planning the query…' })
    const scope = buildAmaScope()
    let plan: FbiAmaPlan
    try {
      plan = await runFbiPlan(question, scope, auth.auth)
      if (typeof plan._balance_cents === 'number') {
        paid.applyBalanceFromWorker(plan._balance_cents)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog({ label: 'Plan failed.', message: msg, status: 'error' })
      setAmaError(msg)
      setAmaLoading(false)
      return
    }
    appendLog({
      label: 'Plan.',
      message: `${plan.output_mode} · ${plan.queries.length} quer${plan.queries.length === 1 ? 'y' : 'ies'} · est. ${fmtCents(plan.estimated_cost_cents)}`,
      status: 'done',
    })

    if (!isAmaPreflightSkipped()) {
      setPendingPlan({ plan, question })
      return
    }
    await runAmaExecute(plan, question)
  }

  async function runAmaExecute(plan: FbiAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    // One interaction id joins the Worker's server-side trace log and the
    // annotation bar's rating/note to the same usage_log row.
    const interactionId = newInteractionId()
    try {
      const synth = await runFbiExecute(plan.token, auth.auth, interactionId)
      if (typeof synth._balance_cents === 'number') {
        paid.applyBalanceFromWorker(synth._balance_cents)
      }
      appendLog({
        label: 'Step 3/3.',
        message: 'Synthesized the answer.',
        status: 'done',
      })
      setAmaSynthesis(synth)
      setAmaResultPlan(plan)
      setAmaInteractionId(interactionId)
      setAmaQuestion(question)
      const total = (plan._cost_cents ?? 0) + (synth._cost_cents ?? 0)
      if (total > 0) {
        appendLog({
          label: 'Done.',
          message: `Total spent: ${fmtCents(total)}`,
          status: 'done',
        })
      } else {
        appendLog({ label: 'Done.', message: '', status: 'done' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog({ label: 'Execute failed.', message: msg, status: 'error' })
      setAmaError(msg)
    } finally {
      setAmaLoading(false)
    }
  }

  async function handleAmaProceed() {
    if (!pendingPlan) return
    const { plan, question } = pendingPlan
    setPendingPlan(null)
    await runAmaExecute(plan, question)
  }

  function handleAmaCancel() {
    if (!pendingPlan) return
    appendLog({
      label: 'Cancelled.',
      message: 'User cancelled at pre-flight.',
      status: 'error',
    })
    setPendingPlan(null)
    setAmaLoading(false)
  }

  function downloadFilterCsv() {
    if (!rows || rows.length === 0) return
    downloadCsv('ragtime-fbi-records-results.csv', {
      title: 'RAGtime — FBI Records export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: FBI_COLUMNS,
      rows,
    })
  }

  function downloadAmaPdf() {
    if (!amaSynthesis?.answer_markdown) return
    const cited = amaSynthesis.document_ids?.length
    downloadNarrativePdf({
      title: 'RAGtime Analysis',
      subtitle: spoke.title,
      metaRows: [
        { key: 'Question', value: amaQuestion },
        ...(cited != null
          ? [{ key: 'Documents cited', value: cited.toLocaleString() }]
          : []),
      ],
      markdown: amaSynthesis.answer_markdown,
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FbiHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      {mlt.active ? (
        <MoreLikeThisView
          controller={mlt}
          documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'document'}
          onOpenResult={handleOpenMltResult}
          openingId={mltOpeningId}
        />
      ) : (
      <>
      <ModeRow
        modes={spoke.queryModes}
        activeMode={activeMode}
        enabledModes={enabledModes}
        onSelect={setActiveMode}
      />
      {activeMode === 'manual_filter' && (
        <>
          {spoke.semanticSearch && (
            <SearchModeToggle
              mode={searchMode}
              onSelect={setSearchMode}
              disabled={queryLoading || semLoading}
            />
          )}
          <FbiFilterForm
            provenance={facets?.provenance ?? []}
            topCollections={facets?.collections ?? []}
            loading={queryLoading}
            onSubmit={handleSubmit}
            initialSearch={carryover ?? undefined}
          />
        </>
      )}
      {activeMode === 'claude_ama' && (
        <ClaudeAmaForm
          loading={amaLoading}
          byokConfigured={auth.hasAuth}
          scopeSize={filterIds.length}
          log={amaLog}
          onSubmit={handleClaudeAmaSubmit}
        />
      )}

      {activeMode === 'manual_filter' && (
        <>
          {showKeywordPane && rows && rows.length > 0 && !queryLoading && (
            <ExportBar onCsv={downloadFilterCsv} />
          )}
          <div
            className={
              panesSideBySide
                ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border'
                : undefined
            }
          >
            {showKeywordPane && (
              <div className="min-w-0">
                {panesSideBySide && <ResultsPaneHeader kind="keyword" />}
                <FbiResultsList
                  rows={rows}
                  count={count}
                  loading={queryLoading}
                  error={queryError}
                  hasRun={hasRun}
                  executedSql={executedSql}
                  onOpenDocument={handleOpenDocument}
                  semanticMatchIds={semHasRun ? semanticIdSet : undefined}
                />
              </div>
            )}
            {showSemanticPane && (
              <div className="min-w-0">
                {panesSideBySide && <ResultsPaneHeader kind="semantic" />}
                <SemanticResultsList
                  rows={semRows}
                  loading={semLoading}
                  error={semError}
                  hasRun={semHasRun}
                  keywordIds={hasRun ? keywordIdSet : undefined}
                  onOpen={handleOpenSemanticResult}
                  openingId={semOpeningId}
                />
              </div>
            )}
          </div>
        </>
      )}
      {activeMode === 'claude_ama' && (
        <>
          {amaSynthesis?.answer_markdown && !amaLoading && (
            <ExportBar onPdf={downloadAmaPdf} />
          )}
          <FbiAmaResult
            synthesis={amaSynthesis}
            plan={amaResultPlan}
            loading={amaLoading}
            error={amaError}
            onOpenDocument={handleOpenDocument}
          />
        </>
      )}
      {activeMode === 'claude_ama' && amaSynthesis && amaInteractionId && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={{
            interaction_id: amaInteractionId,
            surface: 'fbi',
            mode: 'ama',
            question: amaQuestion,
            output_mode: amaSynthesis.output_mode,
            plan: amaResultPlan
              ? {
                  output_mode: amaResultPlan.output_mode,
                  approach_summary: amaResultPlan.approach_summary,
                  queries: amaResultPlan.queries,
                  estimated_cost_cents: amaResultPlan.estimated_cost_cents,
                }
              : null,
            query_summary: amaSynthesis.query_summary,
            answer_markdown: amaSynthesis.answer_markdown,
            cited_ids: amaSynthesis.document_ids,
            candor_notes: amaSynthesis.candor_notes,
            cost_cents:
              (amaResultPlan?._cost_cents ?? 0) + (amaSynthesis._cost_cents ?? 0),
          }}
        />
      )}

      </>
      )}
      <MoreLikeThisPrompt
        seed={mlt.pendingSeed}
        documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'document'}
        similarityHints={spoke.moreLikeThis?.similarityHints ?? []}
        loading={mlt.loading}
        onSubmit={mlt.submitPivot}
        onCancel={mlt.cancelPivot}
      />
      <FbiDocumentDetailSheet
        row={openDocument}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMoreLikeThis={handleMoreLikeThis}
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
 * Header band. The fourth tile is deliberately NOT a coverage-dates tile —
 * this corpus has no document dates, so it shows the recovered-documents
 * count instead (the quiet half of locked decision #1).
 */
function FbiHeader({
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
  const live = holdings?.provenance?.live
  const recovered = holdings?.provenance?.recovered
  return (
    <header className="border-b border-border bg-card px-6 py-5">
      <BackToHubLink className="mb-3" />
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
        <HoldingTile
          label="Documents"
          value={holdings?.counts.documents}
          loading={loading}
        />
        <HoldingTile
          label="Collections"
          value={holdings?.counts.collections}
          loading={loading}
        />
        <HoldingTile label="Live on the Vault" value={live} loading={loading} />
        <HoldingTile
          label="Removed · recovered"
          value={recovered}
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

function fmtCents(c: number | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(1)}¢`
  return `$${(c / 100).toFixed(2)}`
}
