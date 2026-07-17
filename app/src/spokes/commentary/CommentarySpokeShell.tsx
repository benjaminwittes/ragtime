import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CommentaryAmaPlan,
  type CommentaryAmaScope,
  type CommentaryAmaSynthesis,
  type CommentaryDisplayRow,
  type CommentaryFacets,
  type CommentaryFilterFields,
  type CommentaryFilterResult,
  type CommentaryPublication,
  type MoreLikeThisCorpus,
  type SemanticSearchRow,
  fetchCommentaryFacets,
  fetchCommentaryItemsByIds,
  runCommentaryExecute,
  runCommentaryFilter,
  runCommentaryPlan,
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
import { COMMENTARY_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { useMoreLikeThis, type MltSeed } from '../more-like-this/useMoreLikeThis'
import { MoreLikeThisPrompt } from '../more-like-this/MoreLikeThisPrompt'
import { MoreLikeThisView } from '../more-like-this/MoreLikeThisView'
import { CommentaryAmaResult } from './CommentaryAmaResult'
import {
  CommentaryDocumentDetailSheet,
  type CommentaryMltSeed,
} from './CommentaryDocumentDetailSheet'
import { CommentaryFilterForm } from './CommentaryFilterForm'
import { CommentaryResultsList } from './CommentaryResultsList'
import { commentaryRowKey } from './commentary-format'

/**
 * Commentary spoke shell — the federated two-publication COMMENTARY corpus
 * (Lawfare + Executive Functions), which REPLACES the standalone Lawfare spoke.
 * Two query modes (mirrors Lawfare):
 *  - manual_filter: structured filter (keyword + publication + author + content
 *    type + date range) + a piece reader detail.
 *  - claude_ama: narrative synthesis ("what has been argued about X"). Plan/
 *    execute over both publications; output is attribution-forward prose +
 *    cited pieces ({publication, id}).
 *
 * The "summarize this piece" surface lives on the detail sheet, not in the mode
 * selector.
 *
 * Scope for AMA: when filter rows have been produced, the AMA call passes those
 * piece ids as scope (publication-qualified when both publications were queried)
 * so synthesis runs over the narrowed set; otherwise scope is the full corpus.
 *
 * Two-publication asymmetries handled here: filter ids / semantic ids are
 * publication-qualified, so all cross-pane overlap + navigation is driven off
 * `{publication, id}` (the display rows), never the raw id array; and MLT is
 * per-publication (the seed's publication picks the Worker slug).
 */
export function CommentarySpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<CommentaryFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  // Total across both publications — facets carry no top-level count.
  const totalItems = useMemo(() => {
    if (!facets) return 0
    return Object.values(facets.publications).reduce(
      (sum, p) => sum + (p.count ?? 0),
      0,
    )
  }, [facets])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchCommentaryFacets()
        if (cancelled) return
        setFacets(f)
        const pubs = Object.values(f.publications)
        const items = pubs.reduce((sum, p) => sum + (p.count ?? 0), 0)
        const earliests = pubs
          .map((p) => p.earliest)
          .filter((d): d is string => !!d)
          .sort()
        const latests = pubs
          .map((p) => p.latest)
          .filter((d): d is string => !!d)
          .sort()
        const earliest = earliests[0]
        const latest = latests[latests.length - 1]
        const h: CorpusHoldings = {
          counts: { items },
          coverage: earliest && latest ? `${earliest} → ${latest}` : '—',
          lastUpdated: latest ?? '—',
          provenance: {
            lawfare: f.publications.lawfare?.count ?? 0,
            executive_functions: f.publications.executive_functions?.count ?? 0,
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
  const [rows, setRows] = useState<CommentaryDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  // All matching ids (separate from `rows`, which is capped for display).
  // Publication-qualified strings when both publications were queried, plain
  // numbers when one. Used as AMA scope. Overlap badging is driven off the
  // rows, not this array.
  const [filterIds, setFilterIds] = useState<Array<string | number>>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // Semantic pane state (brief #9). Same pattern as Lawfare; the keyword pane
  // is the filter state above, unchanged.
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
    plan: CommentaryAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] =
    useState<CommentaryAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<CommentaryAmaPlan | null>(null)
  // Usage log.
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): CommentaryAmaScope {
    if (filterIds.length === 0) {
      return {
        is_full_db: true,
        count: totalItems,
        description: `The full commentary corpus (${totalItems.toLocaleString()} pieces across both publications).`,
      }
    }
    return {
      document_ids: filterIds,
      is_full_db: false,
      count: filterIds.length,
      description: `${filterIds.length.toLocaleString()} pieces from the current filter.`,
    }
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const [openDocument, setOpenDocument] =
    useState<CommentaryDisplayRow | null>(null)

  /** Open a piece in the reader. Used by the manual-filter results list, the
   *  semantic pane, the AMA cited list, and the MLT view. */
  function handleOpenDocument(row: CommentaryDisplayRow) {
    setOpenDocument(row)
    setDetailOpen(true)
  }

  // Hub → workspace carryover (`?q=`): seed the keyword field + auto-run once
  // on mount so we land on the responsive set, not the full corpus.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(fields: CommentaryFilterFields) {
    // Both panes off one submit (brief #9). Commentary's free-text field is
    // `search`.
    const wantKeyword = searchMode !== 'semantic'
    const wantSemantic =
      spoke.semanticSearch === true &&
      searchMode !== 'keyword' &&
      !!fields.search?.trim()
    if (searchMode === 'semantic' && !wantSemantic) {
      setSemHasRun(true)
      setSemRows([])
      setSemError(
        'Semantic search needs search text — add words to the keyword field. (Structured filters alone run in Keyword mode.)',
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

  async function runKeywordPane(fields: CommentaryFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: CommentaryFilterResult = await runCommentaryFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'commentary',
          mode: 'manual_filter',
          question:
            fields.search ?? fields.author ?? '(structured filter)',
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
      const r = await runSemanticSearch('commentary', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'commentary',
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

  /** Open a semantic result via items-by-ids so the reader renders the same
   *  shape as a filter-list open. Commentary semantic ids are publication-
   *  qualified ('lawfare:123'); split them before the per-publication fetch. */
  async function handleOpenSemanticResult(row: SemanticSearchRow) {
    const parsed = parseQualifiedId(row.id)
    if (!parsed) return
    setSemOpeningId(row.id)
    try {
      const full = await fetchCommentaryItemsByIds(parsed.publication, [
        parsed.id,
      ])
      if (full.length > 0) handleOpenDocument(full[0])
    } catch {
      // Best-effort; the card simply stays closed.
    } finally {
      setSemOpeningId(null)
    }
  }

  // ── "More like this" pivot stack (briefs §3) ───────────────────────────
  // Commentary MLT is PER-PUBLICATION: the Worker keys it
  // 'commentary:<publication>' and seed ids are plain per-publication numbers.
  // The pivot publication is fixed for a whole chain (results resolve to the
  // seed's publication), so we track it in state and derive the slug from it.
  const [mltPublication, setMltPublication] =
    useState<CommentaryPublication>('lawfare')
  const mltSlug: MoreLikeThisCorpus = `commentary:${mltPublication}`
  const [mltOpeningId, setMltOpeningId] = useState<string | null>(null)
  const mlt = useMoreLikeThis({
    slug: mltSlug,
    auth: auth.auth,
    stashedLabel: 'Commentary search',
    onBalance: paid.applyBalanceFromWorker,
    onResult: (page) => {
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'commentary',
          mode: 'more_like_this',
          question: page.prompt || '(overall similarity)',
          plan: {
            seed_id: page.seed.id,
            publication: mltPublication,
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

  function handleMoreLikeThis(seed: CommentaryMltSeed) {
    setDetailOpen(false)
    setMltPublication(seed.publication)
    const mltSeed: MltSeed = { id: seed.id, title: seed.title }
    mlt.requestPivot(mltSeed)
  }

  async function handleOpenMltResult(id: string) {
    setMltOpeningId(id)
    try {
      const full = await fetchCommentaryItemsByIds(mltPublication, [id])
      if (full.length > 0) handleOpenDocument(full[0])
    } catch {
      // Best-effort.
    } finally {
      setMltOpeningId(null)
    }
  }

  // Overlap badging (brief #9). Both panes speak publication-qualified keys
  // ('lawfare:123'): the semantic pane's ids already are, and the keyword rows
  // build theirs from {publication, id}. Single-publication filters return
  // plain numeric ids, so we derive the keyword key set from the rows, never
  // the raw filter-ids array.
  const keywordKeySet = useMemo(
    () => new Set((rows ?? []).map((r) => commentaryRowKey(r))),
    [rows],
  )
  const semanticKeySet = useMemo(
    () => new Set((semRows ?? []).map((r) => r.id)),
    [semRows],
  )
  const showKeywordPane = searchMode !== 'semantic'
  const showSemanticPane =
    spoke.semanticSearch === true &&
    searchMode !== 'keyword' &&
    (semHasRun || semLoading)
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
    let plan: CommentaryAmaPlan
    try {
      plan = await runCommentaryPlan(question, scope, auth.auth)
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

  async function runAmaExecute(plan: CommentaryAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    // One id for the whole interaction: sent to the Worker so its server-side
    // trace log lands on the same usage_log row the inline annotation upserts
    // onto, and reused below for the annotation component.
    const interactionId = newInteractionId()
    try {
      const synth = await runCommentaryExecute(
        plan.token,
        auth.auth,
        interactionId,
      )
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
    downloadCsv('ragtime-commentary-results.csv', {
      title: 'RAGtime — Commentary export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: COMMENTARY_COLUMNS,
      rows,
    })
  }

  function downloadAmaPdf() {
    if (!amaSynthesis?.answer_markdown) return
    const cited = amaSynthesis.cited?.length
    downloadNarrativePdf({
      title: 'RAGtime Analysis',
      subtitle: spoke.title,
      metaRows: [
        { key: 'Question', value: amaQuestion },
        ...(cited != null
          ? [{ key: 'Pieces cited', value: cited.toLocaleString() }]
          : []),
      ],
      markdown: amaSynthesis.answer_markdown,
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CommentaryHeader
        spoke={spoke}
        holdings={holdings}
        loading={facetsLoading}
        error={facetsError}
      />
      {mlt.active ? (
        <MoreLikeThisView
          controller={mlt}
          documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'piece'}
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
            docSlug="commentary-narrative-synthesis"
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
              <CommentaryFilterForm
                publications={facets?.publications ?? {}}
                topAuthors={facets?.top_authors ?? []}
                postTypes={facets?.post_types ?? []}
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
                    <CommentaryResultsList
                      rows={rows}
                      count={count}
                      loading={queryLoading}
                      error={queryError}
                      hasRun={hasRun}
                      executedSql={executedSql}
                      onOpenDocument={handleOpenDocument}
                      semanticMatchKeys={semHasRun ? semanticKeySet : undefined}
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
                      keywordIds={hasRun ? keywordKeySet : undefined}
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
              <CommentaryAmaResult
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
                surface: 'commentary',
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
                cited_ids: amaSynthesis.cited,
                candor_notes: amaSynthesis.candor_notes,
                cost_cents:
                  (amaResultPlan?._cost_cents ?? 0) +
                  (amaSynthesis._cost_cents ?? 0),
              }}
            />
          )}
        </>
      )}
      <MoreLikeThisPrompt
        seed={mlt.pendingSeed}
        documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'piece'}
        similarityHints={spoke.moreLikeThis?.similarityHints ?? []}
        loading={mlt.loading}
        onSubmit={mlt.submitPivot}
        onCancel={mlt.cancelPivot}
      />
      <CommentaryDocumentDetailSheet
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

/** Split a publication-qualified id ('lawfare:123') into its parts. Returns
 *  null for a malformed or unknown-publication id. */
function parseQualifiedId(
  raw: string,
): { publication: CommentaryPublication; id: number } | null {
  const m = /^(lawfare|executive_functions):(\d+)$/.exec(raw)
  if (!m) return null
  return { publication: m[1] as CommentaryPublication, id: Number(m[2]) }
}

function CommentaryHeader({
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
  const lawfare = holdings?.provenance?.lawfare
  const executiveFunctions = holdings?.provenance?.executive_functions
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
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <HoldingTile
          label="Pieces"
          value={holdings?.counts.items}
          loading={loading}
        />
        <HoldingTile label="Lawfare" value={lawfare} loading={loading} />
        <HoldingTile
          label="Executive Functions"
          value={executiveFunctions}
          loading={loading}
        />
      </div>
      <div className="mt-3">
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
