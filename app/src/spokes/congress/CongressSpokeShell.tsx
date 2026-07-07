import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CongressAmaPlan,
  type CongressAmaScope,
  type CongressAmaSynthesis,
  type CongressAnyDisplayRow,
  type CongressCollection,
  type CongressFacets,
  type CongressFilterFields,
  type CongressFilterResult,
  type MoreLikeThisCorpus,
  type SemanticSearchRow,
  fetchCongressFacets,
  fetchCongressItemsByIds,
  runCongressExecute,
  runCongressFilter,
  runCongressPlan,
  runSemanticSearch,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
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
import type { CsvColumn } from '@/lib/export-csv'
import { downloadNarrativePdf } from '@/lib/export-pdf'
import { CONGRESS_COLUMNS_BY_COLLECTION } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { useMoreLikeThis, type MltSeed } from '../more-like-this/useMoreLikeThis'
import { MoreLikeThisPrompt } from '../more-like-this/MoreLikeThisPrompt'
import { MoreLikeThisView } from '../more-like-this/MoreLikeThisView'
import { CongressAmaResult } from './CongressAmaResult'
import { CongressFilterForm } from './CongressFilterForm'
import { CongressDocumentDetailSheet } from './CongressDocumentDetailSheet'
import { CongressResultsList } from './CongressResultsList'
import { TurnsSurface, type TurnsHearingScope } from './TurnsSurface'
import {
  CONGRESS_COLLECTIONS,
  collectionLabel,
  parseCitedId,
} from './congress-format'

/**
 * Congress spoke shell (brief #13) — ONE spoke over five collections,
 * routed by a compact collection selector (locked design: internal
 * routing, not separate hub cards). Default collection: hearings.
 *
 * Query modes:
 *  - manual_filter: per-collection structured filter + the keyword/
 *    semantic/both toggle (semantic contributes nothing until the corpus
 *    embed lands, then lights up with no frontend change).
 *  - claude_ama: plan→execute→synthesize across the five tables; filter
 *    results narrow the scope to the active collection's ids when present.
 *
 * The hearings collection carries the "Who said what" turns sub-pane —
 * the clemency-sub-surface pattern from the presidential spoke — reachable
 * by its own secondary tab and pre-filterable from a hearing detail
 * sheet's "Explore turns" button.
 */
export function CongressSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<CongressFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchCongressFacets()
        if (cancelled) return
        setFacets(f)
        const c = f.collections
        const total =
          c.laws.count +
          c.bills.count +
          c.hearings.count +
          c.record.count +
          c.testimony.count
        const h: CorpusHoldings = {
          counts: { documents: total },
          coverage: 'Laws to 1789 · hearings 1933 → · record 1994 → · bills 2003 →',
          lastUpdated: c.record.latest,
          provenance: {
            laws: c.laws.count,
            bills: c.bills.count,
            hearings: c.hearings.count,
            record: c.record.count,
            testimony: c.testimony.count,
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

  // Collection routing (brief #13: one spoke, five collections, default
  // hearings) + the hearings-only turns sub-pane.
  const [collection, setCollection] = useState<CongressCollection>('hearings')
  const [hearingsView, setHearingsView] = useState<'documents' | 'turns'>(
    'documents',
  )
  const [turnsHearingScope, setTurnsHearingScope] =
    useState<TurnsHearingScope | null>(null)

  // Filter state (per active collection; cleared on collection switch).
  const [rows, setRows] = useState<CongressAnyDisplayRow[] | undefined>(undefined)
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
    plan: CongressAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<CongressAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<CongressAmaPlan | null>(null)
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')
  const [amaScopeCollection, setAmaScopeCollection] =
    useState<CongressCollection | null>(null)

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function switchCollection(next: CongressCollection) {
    if (next === collection) return
    setCollection(next)
    // Filter + semantic state is collection-shaped — clear it.
    setRows(undefined)
    setCount(undefined)
    setFilterIds([])
    setExecutedSql(undefined)
    setQueryError(undefined)
    setHasRun(false)
    clearSemanticPane()
  }

  function buildAmaScope(): CongressAmaScope {
    if (filterIds.length === 0) {
      const c = facets?.collections
      const total = c
        ? c.laws.count + c.bills.count + c.hearings.count + c.record.count + c.testimony.count
        : 1182281
      return {
        is_full_db: true,
        count: total,
        description: `The full Congress corpus (${total.toLocaleString()} documents across laws, bills, hearings, the Congressional Record, and written testimony).`,
      }
    }
    return {
      document_ids: filterIds,
      collection,
      is_full_db: false,
      count: filterIds.length,
      description: `${filterIds.length.toLocaleString()} documents from the current ${collectionLabel(collection)} filter.`,
    }
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const [openDocument, setOpenDocument] =
    useState<CongressAnyDisplayRow | null>(null)
  // Cited AMA docs can belong to a different collection than the active one.
  const [openCollection, setOpenCollection] =
    useState<CongressCollection>('hearings')

  function handleOpenDocument(
    docCollection: CongressCollection,
    row: CongressAnyDisplayRow,
  ) {
    setOpenCollection(docCollection)
    setOpenDocument(row)
    setDetailOpen(true)
  }

  function handleExploreTurns(hearing: TurnsHearingScope) {
    setDetailOpen(false)
    switchCollection('hearings')
    setHearingsView('turns')
    setTurnsHearingScope(hearing)
  }

  // Hub → workspace carryover (`?q=`) — lands on the default collection.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ collection, search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(fields: CongressFilterFields) {
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

  async function runKeywordPane(fields: CongressFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: CongressFilterResult = await runCongressFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'congress',
          mode: 'manual_filter',
          question: fields.search ?? fields.committee ?? '(structured filter)',
          plan: {
            fields,
            executed_sql: r.executed_sql,
            search_mode: searchMode,
          },
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
      const r = await runSemanticSearch('congress', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'congress',
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

  async function openByAnyId(rawId: string | number) {
    // Semantic/MLT result ids may be collection-qualified ('bills:75567')
    // or bare (assume the active collection).
    const parsed = parseCitedId(rawId, collection)
    if (!parsed) return
    const full = await fetchCongressItemsByIds(parsed.collection, [parsed.id])
    if (full.length > 0) handleOpenDocument(parsed.collection, full[0])
  }

  async function handleOpenSemanticResult(row: SemanticSearchRow) {
    setSemOpeningId(row.id)
    try {
      await openByAnyId(row.id)
    } catch {
      // Detail open is best-effort; the card simply stays closed.
    } finally {
      setSemOpeningId(null)
    }
  }

  // ── "More like this" pivot stack (briefs §3) ───────────────────────────
  // Congress MLT is per-collection: the Worker keys the five collections as
  // compound slugs ('congress:laws' … 'congress:testimony').
  const [mltOpeningId, setMltOpeningId] = useState<string | null>(null)
  const mltSlug = `congress:${collection}` as MoreLikeThisCorpus
  const mlt = useMoreLikeThis({
    slug: mltSlug,
    auth: auth.auth,
    stashedLabel: 'Congress search',
    onBalance: paid.applyBalanceFromWorker,
    onResult: (page) => {
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'congress',
          mode: 'more_like_this',
          question: page.prompt || '(overall similarity)',
          plan: {
            seed_id: page.seed.id,
            collection,
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
      await openByAnyId(id)
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
    setAmaScopeCollection(scope.is_full_db ? null : collection)
    let plan: CongressAmaPlan
    try {
      plan = await runCongressPlan(question, scope, auth.auth)
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

  async function runAmaExecute(plan: CongressAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runCongressExecute(plan.token, auth.auth)
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
    downloadCsv(`ragtime-congress-${collection}-results.csv`, {
      title: `RAGtime — Congress export (${collectionLabel(collection)})`,
      meta: [
        { key: 'collection', value: collection },
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: CONGRESS_COLUMNS_BY_COLLECTION[
        collection
      ] as CsvColumn<CongressAnyDisplayRow>[],
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

  const showTurns = collection === 'hearings' && hearingsView === 'turns'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CongressHeader
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
      <CollectionToggle
        collection={collection}
        holdings={holdings}
        onSelect={switchCollection}
      />
      {collection === 'hearings' && (
        <HearingsViewToggle view={hearingsView} onSelect={setHearingsView} />
      )}
      {showTurns ? (
        <TurnsSurface
          auth={auth.auth}
          hearingScope={turnsHearingScope}
          onClearHearingScope={() => setTurnsHearingScope(null)}
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
          <CongressFilterForm
            key={collection}
            collection={collection}
            committees={facets?.top_committees ?? []}
            granuleClasses={facets?.granule_classes ?? []}
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
                <CongressResultsList
                  collection={collection}
                  rows={rows}
                  count={count}
                  loading={queryLoading}
                  error={queryError}
                  hasRun={hasRun}
                  executedSql={executedSql}
                  onOpenDocument={(row) => handleOpenDocument(collection, row)}
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
          <CongressAmaResult
            synthesis={amaSynthesis}
            plan={amaResultPlan}
            loading={amaLoading}
            error={amaError}
            scopeCollection={amaScopeCollection}
            onOpenDocument={handleOpenDocument}
          />
        </>
      )}
      {activeMode === 'claude_ama' && amaSynthesis && amaInteractionId && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={{
            interaction_id: amaInteractionId,
            surface: 'congress',
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
      <CongressDocumentDetailSheet
        collection={openCollection}
        row={openDocument}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMoreLikeThis={handleMoreLikeThis}
        onExploreTurns={handleExploreTurns}
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
 * The collection selector — a compact segmented control routing between
 * the five collections inside the one spoke (locked design: no per-
 * collection hub cards).
 */
function CollectionToggle({
  collection,
  holdings,
  onSelect,
}: {
  collection: CongressCollection
  holdings: CorpusHoldings | undefined
  onSelect: (c: CongressCollection) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-6 pt-3">
      {CONGRESS_COLLECTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-current={collection === key}
          className={cn(
            'rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            collection === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
          {holdings?.provenance?.[key] != null && (
            <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
              {compactCount(holdings.provenance[key])}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** Hearings-only secondary tab: transcripts list vs. the turns sub-pane. */
function HearingsViewToggle({
  view,
  onSelect,
}: {
  view: 'documents' | 'turns'
  onSelect: (v: 'documents' | 'turns') => void
}) {
  const tabs: Array<['documents' | 'turns', string]> = [
    ['documents', 'Transcripts'],
    ['turns', 'Who said what'],
  ]
  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-6 pt-2">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-current={view === key}
          className={cn(
            'rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
            view === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** 93,959 → '94k'; 883,436 → '883k'; 1,182,281 → '1.2M'. */
function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function CongressHeader({
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
          label="Hearings"
          value={holdings?.provenance?.hearings}
          loading={loading}
        />
        <HoldingTile
          label="Record granules"
          value={holdings?.provenance?.record}
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

function fmtCents(c: number | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(1)}¢`
  return `$${(c / 100).toFixed(2)}`
}
