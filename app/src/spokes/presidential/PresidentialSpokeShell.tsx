import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type PresidentialAmaPlan,
  type PresidentialAmaScope,
  type PresidentialAmaSynthesis,
  type PresidentialFacets,
  type PresidentialFilterFields,
  type PresidentialFilterResult,
  type PresidentialDocumentDisplayRow,
  type SemanticSearchRow,
  fetchPresidentialFacets,
  fetchPresidentialItemsByIds,
  runPresidentialExecute,
  runPresidentialFilter,
  runPresidentialPlan,
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
import { PRESIDENTIAL_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { PresidentialAmaResult } from './PresidentialAmaResult'
import { PresidentialFilterForm } from './PresidentialFilterForm'
import { PresidentialDocumentDetailSheet } from './PresidentialDocumentDetailSheet'
import { PresidentialResultsList } from './PresidentialResultsList'

/**
 * Presidential Documents spoke shell (brief #11). Two query modes:
 *  - manual_filter: structured filter + keyword/semantic/both toggle
 *    (first spoke to launch with the brief #9 surface built in — the
 *    corpus arrived fully embedded) + document detail with the parsed
 *    disposition trail.
 *  - claude_ama: status/lineage + reversal-matrix + trend + narrative
 *    synthesis over presidential_documents + presidential_dispositions.
 *
 * "Summarize this document" lives on the detail sheet, not in the mode
 * selector. Scope for AMA: filter results narrow the corpus when present.
 */
export function PresidentialSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<PresidentialFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchPresidentialFacets()
        if (cancelled) return
        setFacets(f)
        const eo =
          f.doc_types.find((t) => t.value === 'executive_order')?.count ?? 0
        const h: CorpusHoldings = {
          counts: { documents: f.document_count },
          coverage: `${f.earliest} → ${f.latest}`,
          lastUpdated: f.latest,
          provenance: {
            executive_orders: eo,
            with_full_text: f.with_text,
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
  const [rows, setRows] = useState<PresidentialDocumentDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [filterIds, setFilterIds] = useState<number[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // Semantic pane state (brief #9).
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
    plan: PresidentialAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<PresidentialAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<PresidentialAmaPlan | null>(null)
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): PresidentialAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.document_count ?? 12654
      return {
        is_full_db: true,
        count: total,
        description: `The full presidential-documents corpus (${total.toLocaleString()} documents).`,
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
    useState<PresidentialDocumentDisplayRow | null>(null)

  function handleOpenDocument(row: PresidentialDocumentDisplayRow) {
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

  async function handleSubmit(fields: PresidentialFilterFields) {
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

  async function runKeywordPane(fields: PresidentialFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: PresidentialFilterResult = await runPresidentialFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'presidential',
          mode: 'manual_filter',
          question:
            fields.search ?? fields.title ?? fields.agency ?? '(structured filter)',
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
      const r = await runSemanticSearch('presidential', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'presidential',
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
      const full = await fetchPresidentialItemsByIds([Number(row.id)])
      if (full.length > 0) handleOpenDocument(full[0])
    } catch {
      // Detail open is best-effort; the card simply stays closed.
    } finally {
      setSemOpeningId(null)
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
    let plan: PresidentialAmaPlan
    try {
      plan = await runPresidentialPlan(question, scope, auth.auth)
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

  async function runAmaExecute(plan: PresidentialAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runPresidentialExecute(plan.token, auth.auth)
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
      setAmaInteractionId(newInteractionId())
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
    downloadCsv('ragtime-presidential-results.csv', {
      title: 'RAGtime — Presidential Documents export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: PRESIDENTIAL_COLUMNS,
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
      <PresidentialHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      <ModeRow
        modes={spoke.queryModes}
        activeMode={activeMode}
        enabledModes={enabledModes}
        onSelect={setActiveMode}
        docSlug="presidential-narrative-synthesis"
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
          <PresidentialFilterForm
            docTypes={facets?.doc_types ?? []}
            presidents={facets?.presidents ?? []}
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
                <PresidentialResultsList
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
          <PresidentialAmaResult
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
            surface: 'presidential',
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

      <PresidentialDocumentDetailSheet
        row={openDocument}
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

function PresidentialHeader({
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
  const eo = holdings?.provenance?.executive_orders
  const withText = holdings?.provenance?.with_full_text
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
        <HoldingTile label="Executive orders" value={eo} loading={loading} />
        <HoldingTile label="With full text" value={withText} loading={loading} />
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

function fmtCents(c: number | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(1)}¢`
  return `$${(c / 100).toFixed(2)}`
}
