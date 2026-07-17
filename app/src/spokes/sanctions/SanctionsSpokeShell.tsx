import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type AmaPlan,
  type FrDocumentDisplayRow,
  type SanctionsAmaPlan,
  type SanctionsAmaSynthesis,
  type SanctionsEntityDisplayRow,
  type SanctionsEntityFacets,
  type SanctionsEntityFilterFields,
  type SanctionsFrFacets,
  type SanctionsFrFilterFields,
  type SanctionsGuidanceDisplayRow,
  type SanctionsGuidanceFacets,
  type SanctionsGuidanceFilterFields,
  type SemanticSearchRow,
  fetchFrItemsByIds,
  fetchSanctionsEntitiesByIds,
  fetchSanctionsEntityFacets,
  fetchSanctionsFrFacets,
  fetchSanctionsGuidanceFacets,
  fetchSanctionsGuidanceItemsByIds,
  runSanctionsEntityFilter,
  runSanctionsExecute,
  runSanctionsFrFilter,
  runSanctionsGuidanceFilter,
  runSanctionsPlan,
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
import type { CorpusSpoke, QueryMode } from '../types'
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
import {
  FR_COLUMNS,
  SANCTIONS_ENTITY_COLUMNS,
  SANCTIONS_GUIDANCE_COLUMNS,
} from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { useMoreLikeThis, type MltSeed } from '../more-like-this/useMoreLikeThis'
import { MoreLikeThisPrompt } from '../more-like-this/MoreLikeThisPrompt'
import { MoreLikeThisView } from '../more-like-this/MoreLikeThisView'
import { FrDocumentDetailSheet } from '../fr/FrDocumentDetailSheet'
import { FrResultsList } from '../fr/FrResultsList'
import { SanctionsAmaResult } from './SanctionsAmaResult'
import { SanctionsEntityDetailSheet } from './SanctionsEntityDetailSheet'
import { SanctionsEntityFilterForm } from './SanctionsEntityFilterForm'
import { SanctionsEntityResultsList } from './SanctionsEntityResultsList'
import { SanctionsFrFilterForm } from './SanctionsFrFilterForm'
import { SanctionsGuidanceDetailSheet } from './SanctionsGuidanceDetailSheet'
import { SanctionsGuidanceFilterForm } from './SanctionsGuidanceFilterForm'
import { SanctionsGuidanceResultsList } from './SanctionsGuidanceResultsList'
import { parseSanctionsQualifiedId } from './sanctions-format'

/**
 * Sanctions spoke shell (brief #15) — the first cross-corpus spoke. Three
 * legs behind one workspace, routed by flat tabs (the congress collection
 * pattern):
 *
 *  - Sanctioned entities (default — the marquee): alias-aware search over
 *    the current SDN + consolidated lists, entity cards, the PINNED
 *    screening candor banner (visible on the pane, never buried) with the
 *    live data-as-of date and a link to OFAC's authoritative search.
 *  - OFAC guidance: FAQs, enforcement actions, general licenses — with the
 *    keyword/semantic/both toggle and "More like this" pivots.
 *  - Federal Register: the sanctions slice, queried live in the fr corpus;
 *    detail views reuse the FR document sheet (no duplication).
 *
 * AMA is full-corpus v1 (no scope narrowing — a deliberate worker
 * deferral) with the 3-branch router; results render branch-shaped in
 * SanctionsAmaResult.
 *
 * The semantic pane (slug 'sanctions') spans BOTH document legs — the
 * worker fans guidance chunks + the predicate-filtered FR chunks and
 * returns leg-qualified ids, so a semantic hit can open either sheet.
 * Entities have no chunks; the entities tab has no semantic toggle rather
 * than a pane that could never match.
 */

type SanctionsPane = 'entities' | 'guidance' | 'fr'

const PANES: Array<{ key: SanctionsPane; label: string }> = [
  { key: 'entities', label: 'Sanctioned entities' },
  { key: 'guidance', label: 'OFAC guidance' },
  { key: 'fr', label: 'Federal Register' },
]

export function SanctionsSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  // ── Facets (all three legs; the header + screening banner hang on the
  // entity facets, forms on their own leg's) ───────────────────────────────
  const [entityFacets, setEntityFacets] = useState<SanctionsEntityFacets>()
  const [guidanceFacets, setGuidanceFacets] = useState<SanctionsGuidanceFacets>()
  const [frFacets, setFrFacets] = useState<SanctionsFrFacets>()
  const [facetsError, setFacetsError] = useState<string>()
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [e, g, f] = await Promise.allSettled([
        fetchSanctionsEntityFacets(),
        fetchSanctionsGuidanceFacets(),
        fetchSanctionsFrFacets(),
      ])
      if (cancelled) return
      if (e.status === 'fulfilled') setEntityFacets(e.value)
      if (g.status === 'fulfilled') setGuidanceFacets(g.value)
      if (f.status === 'fulfilled') setFrFacets(f.value)
      if (e.status === 'rejected') {
        setFacetsError(
          e.reason instanceof Error ? e.reason.message : String(e.reason),
        )
      }
      setFacetsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Pane + mode routing ──────────────────────────────────────────────────
  const [pane, setPane] = useState<SanctionsPane>('entities')
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function switchPane(next: SanctionsPane) {
    if (next === pane) return
    setPane(next)
    clearSemanticPane()
  }

  // ── Entity pane state ────────────────────────────────────────────────────
  const [entityRows, setEntityRows] = useState<SanctionsEntityDisplayRow[]>()
  const [entityCount, setEntityCount] = useState<number>()
  const [entityExecutedSql, setEntityExecutedSql] = useState<string>()
  const [entityLoading, setEntityLoading] = useState(false)
  const [entityError, setEntityError] = useState<string>()
  const [entityHasRun, setEntityHasRun] = useState(false)

  async function handleEntitySubmit(fields: SanctionsEntityFilterFields) {
    setEntityLoading(true)
    setEntityError(undefined)
    setEntityHasRun(true)
    try {
      const r = await runSanctionsEntityFilter(fields)
      setEntityRows(r.display_rows)
      setEntityCount(r.count)
      setEntityExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'sanctions',
          mode: 'manual_filter',
          question: fields.search ?? '(structured entity filter)',
          plan: { pane: 'entities', fields, executed_sql: r.executed_sql },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setEntityError(e instanceof Error ? e.message : String(e))
      setEntityRows([])
      setEntityCount(0)
      setEntityExecutedSql(undefined)
    } finally {
      setEntityLoading(false)
    }
  }

  // ── Guidance pane state ──────────────────────────────────────────────────
  const [guidanceRows, setGuidanceRows] = useState<SanctionsGuidanceDisplayRow[]>()
  const [guidanceCount, setGuidanceCount] = useState<number>()
  const [guidanceIds, setGuidanceIds] = useState<number[]>([])
  const [guidanceExecutedSql, setGuidanceExecutedSql] = useState<string>()
  const [guidanceLoading, setGuidanceLoading] = useState(false)
  const [guidanceError, setGuidanceError] = useState<string>()
  const [guidanceHasRun, setGuidanceHasRun] = useState(false)

  async function runGuidanceKeywordPane(fields: SanctionsGuidanceFilterFields) {
    setGuidanceLoading(true)
    setGuidanceError(undefined)
    setGuidanceHasRun(true)
    try {
      const r = await runSanctionsGuidanceFilter(fields)
      setGuidanceRows(r.display_rows)
      setGuidanceCount(r.count)
      setGuidanceIds(r.ids)
      setGuidanceExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'sanctions',
          mode: 'manual_filter',
          question: fields.search ?? '(structured guidance filter)',
          plan: {
            pane: 'guidance',
            fields,
            executed_sql: r.executed_sql,
            search_mode: searchMode,
          },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setGuidanceError(e instanceof Error ? e.message : String(e))
      setGuidanceRows([])
      setGuidanceCount(0)
      setGuidanceIds([])
      setGuidanceExecutedSql(undefined)
    } finally {
      setGuidanceLoading(false)
    }
  }

  async function handleGuidanceSubmit(fields: SanctionsGuidanceFilterFields) {
    await submitDocumentsPane(
      fields.search,
      () => runGuidanceKeywordPane(fields),
    )
  }

  // ── FR-slice pane state ──────────────────────────────────────────────────
  const [frRows, setFrRows] = useState<FrDocumentDisplayRow[]>()
  const [frCount, setFrCount] = useState<number>()
  const [frExecutedSql, setFrExecutedSql] = useState<string>()
  const [frLoading, setFrLoading] = useState(false)
  const [frError, setFrError] = useState<string>()
  const [frHasRun, setFrHasRun] = useState(false)

  async function runFrKeywordPane(fields: SanctionsFrFilterFields) {
    setFrLoading(true)
    setFrError(undefined)
    setFrHasRun(true)
    try {
      const r = await runSanctionsFrFilter(fields)
      setFrRows(r.display_rows)
      setFrCount(r.count)
      setFrExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'sanctions',
          mode: 'manual_filter',
          question: fields.search ?? '(structured FR-slice filter)',
          plan: {
            pane: 'fr',
            fields,
            executed_sql: r.executed_sql,
            search_mode: searchMode,
          },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setFrError(e instanceof Error ? e.message : String(e))
      setFrRows([])
      setFrCount(0)
      setFrExecutedSql(undefined)
    } finally {
      setFrLoading(false)
    }
  }

  async function handleFrSubmit(fields: SanctionsFrFilterFields) {
    await submitDocumentsPane(fields.search, () => runFrKeywordPane(fields))
  }

  // ── Semantic pane (shared by the two document legs) ──────────────────────
  const [searchMode, setSearchMode] = useState<SearchMode>('both')
  const [semRows, setSemRows] = useState<SemanticSearchRow[]>()
  const [semLoading, setSemLoading] = useState(false)
  const [semError, setSemError] = useState<string>()
  const [semHasRun, setSemHasRun] = useState(false)
  const [semOpeningId, setSemOpeningId] = useState<string | null>(null)

  function clearSemanticPane() {
    setSemRows(undefined)
    setSemError(undefined)
    setSemHasRun(false)
  }

  /** The keyword/semantic/both split for the guidance + FR panes. Entities
   *  never route here — they have no chunks. */
  async function submitDocumentsPane(
    searchText: string | undefined,
    runKeyword: () => Promise<void>,
  ) {
    const wantKeyword = searchMode !== 'semantic'
    const wantSemantic = searchMode !== 'keyword' && !!searchText?.trim()
    if (searchMode === 'semantic' && !wantSemantic) {
      setSemHasRun(true)
      setSemRows([])
      setSemError(
        'Semantic search needs search text — add words to the search field. (Structured filters alone run in Keyword mode.)',
      )
      return
    }
    await Promise.all([
      wantKeyword ? runKeyword() : Promise.resolve(),
      wantSemantic
        ? runSemanticPane(searchText!.trim())
        : Promise.resolve(clearSemanticPane()),
    ])
  }

  async function runSemanticPane(query: string) {
    setSemLoading(true)
    setSemError(undefined)
    setSemHasRun(true)
    try {
      const r = await runSemanticSearch('sanctions', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'sanctions',
          mode: 'semantic_search',
          question: query,
          plan: { pane, search_mode: searchMode },
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

  // ── Detail sheets (one per leg) ──────────────────────────────────────────
  const [openEntity, setOpenEntity] = useState<SanctionsEntityDisplayRow | null>(null)
  const [entityDetailOpen, setEntityDetailOpen] = useState(false)
  const [openGuidance, setOpenGuidance] =
    useState<SanctionsGuidanceDisplayRow | null>(null)
  const [guidanceDetailOpen, setGuidanceDetailOpen] = useState(false)
  const [openFr, setOpenFr] = useState<FrDocumentDisplayRow | null>(null)
  const [frDetailOpen, setFrDetailOpen] = useState(false)

  function handleOpenEntity(row: SanctionsEntityDisplayRow) {
    setOpenEntity(row)
    setEntityDetailOpen(true)
  }

  function handleOpenGuidance(row: SanctionsGuidanceDisplayRow) {
    setOpenGuidance(row)
    setGuidanceDetailOpen(true)
  }

  function handleOpenFr(row: FrDocumentDisplayRow) {
    setOpenFr(row)
    setFrDetailOpen(true)
  }

  /** Open a leg-qualified id from the semantic pane, the prose sources, or
   *  an MLT result (bare ids there are guidance ids). */
  async function openQualifiedId(rawId: string): Promise<void> {
    const parsed = parseSanctionsQualifiedId(rawId)
    if (!parsed) return
    if (parsed.leg === 'guidance') {
      const rows = await fetchSanctionsGuidanceItemsByIds([parsed.id])
      if (rows.length > 0) handleOpenGuidance(rows[0])
    } else if (parsed.leg === 'fr') {
      const rows = await fetchFrItemsByIds([parsed.id])
      if (rows.length > 0) handleOpenFr(rows[0])
    } else {
      const rows = await fetchSanctionsEntitiesByIds([parsed.id])
      if (rows.length > 0) handleOpenEntity(rows[0])
    }
  }

  async function handleOpenSemanticResult(row: SemanticSearchRow) {
    setSemOpeningId(row.id)
    try {
      await openQualifiedId(row.id)
    } catch {
      // Detail open is best-effort; the card simply stays closed.
    } finally {
      setSemOpeningId(null)
    }
  }

  // ── "More like this" (guidance leg only — sanctions:guidance) ───────────
  const [mltOpeningId, setMltOpeningId] = useState<string | null>(null)
  const mlt = useMoreLikeThis({
    slug: 'sanctions:guidance',
    auth: auth.auth,
    stashedLabel: 'Sanctions search',
    onBalance: paid.applyBalanceFromWorker,
    onResult: (page) => {
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'sanctions',
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
    setGuidanceDetailOpen(false)
    mlt.requestPivot(seed)
  }

  async function handleOpenMltResult(id: string) {
    setMltOpeningId(id)
    try {
      await openQualifiedId(id)
    } catch {
      // Best-effort.
    } finally {
      setMltOpeningId(null)
    }
  }

  // Hub → workspace carryover (`?q=`) — lands on the marquee entity pane.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleEntitySubmit({ search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── AMA (full-corpus v1; branch-shaped results) ──────────────────────────
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: SanctionsAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<SanctionsAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string>()
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<SanctionsAmaPlan | null>(null)
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

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
    appendLog({ label: 'Step 1/3.', message: 'Routing and planning the query…' })
    let plan: SanctionsAmaPlan
    try {
      plan = await runSanctionsPlan(question, auth.auth)
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
    const branchNote =
      plan.branch === 'entity'
        ? `entity lookup · ${(plan.queries ?? []).length} SQL quer${(plan.queries ?? []).length === 1 ? 'y' : 'ies'}`
        : plan.branch === 'count'
          ? `count/aggregate · ${(plan.queries ?? []).length} SQL quer${(plan.queries ?? []).length === 1 ? 'y' : 'ies'}`
          : `documents · ${(plan.items ?? []).length} passages retrieved`
    appendLog({
      label: 'Routed.',
      message: `${branchNote} · est. ${fmtCents(plan.estimated_cost_cents)}`,
      status: 'done',
    })

    if (!isAmaPreflightSkipped()) {
      setPendingPlan({ plan, question })
      return
    }
    await runAmaExecute(plan, question)
  }

  async function runAmaExecute(plan: SanctionsAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({ label: 'Step 2/3.', message: 'Executing the plan…' })
    // One interaction id joins the Worker's server-side trace log and the
    // annotation bar's rating/note to the same usage_log row.
    const interactionId = newInteractionId()
    try {
      const synth = await runSanctionsExecute(plan.token, auth.auth, interactionId)
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

  /** Adapt the branch-shaped sanctions plan to the shared AmaPreflight
   *  contract (prose/count carry no output_mode — narrative is honest). */
  function preflightPlan(plan: SanctionsAmaPlan): AmaPlan {
    return {
      token: plan.token,
      output_mode: plan.output_mode ?? 'narrative',
      approach_summary: plan.approach_summary ?? '',
      candor_notes: plan.candor_notes,
      queries: plan.queries ?? [],
      estimated_cost_cents: plan.estimated_cost_cents,
      _cost_cents: plan._cost_cents,
      _balance_cents: plan._balance_cents,
    }
  }

  // ── Exports ──────────────────────────────────────────────────────────────
  function downloadPaneCsv() {
    if (pane === 'entities' && entityRows && entityRows.length > 0) {
      downloadCsv('ragtime-sanctions-entities.csv', {
        title: 'RAGtime — Sanctions export (entities)',
        meta: [
          { key: 'count', value: entityCount },
          { key: 'data_as_of', value: entityFacets?.data_as_of },
          { key: 'screening_note', value: entityFacets?.screening_note },
          { key: 'executed_sql', value: entityExecutedSql },
        ],
        columns: SANCTIONS_ENTITY_COLUMNS,
        rows: entityRows,
      })
    } else if (pane === 'guidance' && guidanceRows && guidanceRows.length > 0) {
      downloadCsv('ragtime-sanctions-guidance.csv', {
        title: 'RAGtime — Sanctions export (OFAC guidance)',
        meta: [
          { key: 'count', value: guidanceCount },
          { key: 'executed_sql', value: guidanceExecutedSql },
        ],
        columns: SANCTIONS_GUIDANCE_COLUMNS,
        rows: guidanceRows,
      })
    } else if (pane === 'fr' && frRows && frRows.length > 0) {
      downloadCsv('ragtime-sanctions-federal-register.csv', {
        title: 'RAGtime — Sanctions export (Federal Register slice)',
        meta: [
          { key: 'count', value: frCount },
          { key: 'executed_sql', value: frExecutedSql },
        ],
        columns: FR_COLUMNS,
        rows: frRows,
      })
    }
  }

  function downloadAmaPdf() {
    if (!amaSynthesis?.answer_markdown) return
    downloadNarrativePdf({
      title: 'RAGtime Analysis',
      subtitle: spoke.title,
      metaRows: [
        { key: 'Question', value: amaQuestion },
        { key: 'Branch', value: amaSynthesis.branch },
      ],
      markdown: amaSynthesis.answer_markdown,
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const paneHasRows =
    (pane === 'entities' && !!entityRows?.length && !entityLoading) ||
    (pane === 'guidance' && !!guidanceRows?.length && !guidanceLoading) ||
    (pane === 'fr' && !!frRows?.length && !frLoading)

  const guidanceIdSet = useMemo(
    () => new Set(guidanceIds.map((id) => `guidance:${id}`)),
    [guidanceIds],
  )
  const paneLoading =
    pane === 'entities'
      ? entityLoading
      : pane === 'guidance'
        ? guidanceLoading
        : frLoading

  const showSemanticToggle = pane !== 'entities'
  const showKeywordPane = pane === 'entities' || searchMode !== 'semantic'
  const showSemanticPane =
    pane !== 'entities' && searchMode !== 'keyword' && (semHasRun || semLoading)
  const panesSideBySide = showKeywordPane && showSemanticPane

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SanctionsHeader
        spoke={spoke}
        entityFacets={entityFacets}
        guidanceFacets={guidanceFacets}
        frFacets={frFacets}
        loading={facetsLoading}
        error={facetsError}
      />
      <ScreeningCandorBanner facets={entityFacets} />
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
          <PaneToggle pane={pane} onSelect={switchPane} />
          {showSemanticToggle && (
            <SearchModeToggle
              mode={searchMode}
              onSelect={setSearchMode}
              disabled={paneLoading || semLoading}
            />
          )}
          {pane === 'entities' && (
            <SanctionsEntityFilterForm
              facets={entityFacets}
              loading={entityLoading}
              onSubmit={handleEntitySubmit}
              initialSearch={carryover ?? undefined}
            />
          )}
          {pane === 'guidance' && (
            <SanctionsGuidanceFilterForm
              facets={guidanceFacets}
              loading={guidanceLoading || semLoading}
              onSubmit={handleGuidanceSubmit}
            />
          )}
          {pane === 'fr' && (
            <SanctionsFrFilterForm
              facets={frFacets}
              loading={frLoading || semLoading}
              onSubmit={handleFrSubmit}
            />
          )}

          {paneHasRows && <ExportBar onCsv={downloadPaneCsv} />}
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
                {pane === 'entities' && (
                  <SanctionsEntityResultsList
                    rows={entityRows}
                    count={entityCount}
                    loading={entityLoading}
                    error={entityError}
                    hasRun={entityHasRun}
                    executedSql={entityExecutedSql}
                    onOpenEntity={handleOpenEntity}
                  />
                )}
                {pane === 'guidance' && (
                  <SanctionsGuidanceResultsList
                    rows={guidanceRows}
                    count={guidanceCount}
                    loading={guidanceLoading}
                    error={guidanceError}
                    hasRun={guidanceHasRun}
                    executedSql={guidanceExecutedSql}
                    onOpenDocument={handleOpenGuidance}
                    semanticMatchIds={semHasRun ? guidanceIdSet : undefined}
                  />
                )}
                {pane === 'fr' && (
                  <FrResultsList
                    rows={frRows}
                    count={frCount}
                    loading={frLoading}
                    error={frError}
                    hasRun={frHasRun}
                    executedSql={frExecutedSql}
                    onOpenDocument={handleOpenFr}
                  />
                )}
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
                  keywordIds={
                    pane === 'guidance' && guidanceHasRun ? guidanceIdSet : undefined
                  }
                  onOpen={handleOpenSemanticResult}
                  openingId={semOpeningId}
                />
              </div>
            )}
          </div>
          {showSemanticPane && (
            <p className="px-6 pb-4 text-[11px] text-muted-foreground/70">
              Semantic results span both document legs — OFAC guidance and the
              Federal Register sanctions slice. The sanctions lists themselves
              are searched by keyword on the Sanctioned entities tab.
            </p>
          )}
        </>
      )}
      {activeMode === 'claude_ama' && (
        <>
          <ClaudeAmaForm
            loading={amaLoading}
            byokConfigured={auth.hasAuth}
            scopeSize={0}
            log={amaLog}
            onSubmit={handleClaudeAmaSubmit}
          />
          {amaSynthesis?.answer_markdown && !amaLoading && (
            <ExportBar onPdf={downloadAmaPdf} />
          )}
          <SanctionsAmaResult
            synthesis={amaSynthesis}
            plan={amaResultPlan}
            loading={amaLoading}
            error={amaError}
            onOpenEntity={handleOpenEntity}
            onOpenQualifiedId={(id) => void openQualifiedId(id).catch(() => {})}
          />
        </>
      )}
      {activeMode === 'claude_ama' && amaSynthesis && amaInteractionId && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={{
            interaction_id: amaInteractionId,
            surface: 'sanctions',
            mode: 'ama',
            question: amaQuestion,
            output_mode:
              amaSynthesis.branch === 'entity'
                ? amaSynthesis.output_mode
                : amaSynthesis.branch,
            plan: amaResultPlan
              ? {
                  branch: amaResultPlan.branch,
                  reason: amaResultPlan.reason,
                  approach_summary: amaResultPlan.approach_summary,
                  queries: amaResultPlan.queries,
                  estimated_cost_cents: amaResultPlan.estimated_cost_cents,
                }
              : null,
            query_summary:
              amaSynthesis.branch === 'entity'
                ? amaSynthesis.query_summary
                : amaSynthesis.branch === 'count'
                  ? amaSynthesis.queries.map((q) => ({
                      label: q.label,
                      total_rows: q.total_rows,
                      error: q.error,
                    }))
                  : [
                      {
                        label: 'prose retrieval',
                        total_rows: (amaResultPlan?.items ?? []).length,
                      },
                    ],
            answer_markdown: amaSynthesis.answer_markdown,
            cited_ids:
              amaSynthesis.branch === 'entity'
                ? amaSynthesis.entity_ids
                : amaSynthesis.branch === 'prose'
                  ? amaSynthesis.source_ids
                  : null,
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
      <SanctionsEntityDetailSheet
        row={openEntity}
        open={entityDetailOpen}
        onOpenChange={setEntityDetailOpen}
      />
      <SanctionsGuidanceDetailSheet
        row={openGuidance}
        open={guidanceDetailOpen}
        onOpenChange={setGuidanceDetailOpen}
        onMoreLikeThis={handleMoreLikeThis}
      />
      <FrDocumentDetailSheet
        row={openFr}
        open={frDetailOpen}
        onOpenChange={setFrDetailOpen}
      />
      <AmaPreflight
        plan={pendingPlan ? preflightPlan(pendingPlan.plan) : null}
        open={!!pendingPlan}
        onProceed={handleAmaProceed}
        onCancel={handleAmaCancel}
        paidAccount={auth.isPaid ? paid.account : null}
      />
    </div>
  )
}

/** Flat tabs over the three legs (the congress collection pattern). */
function PaneToggle({
  pane,
  onSelect,
}: {
  pane: SanctionsPane
  onSelect: (p: SanctionsPane) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-6 pt-3">
      {PANES.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-current={pane === key}
          className={cn(
            'rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            pane === key
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

/**
 * The pinned screening candor banner (brief #15 decision #2) — VISIBLE on
 * the pane, not buried. The note text is Worker-composed (the pinned
 * constant + the live data-as-of date, unit-test-pinned server-side); the
 * banner renders it verbatim and adds the one-click link to OFAC's
 * authoritative search. A static fallback covers a facets outage — the
 * candor never depends on a fetch succeeding.
 */
function ScreeningCandorBanner({
  facets,
}: {
  facets: SanctionsEntityFacets | undefined
}) {
  const note =
    facets?.screening_note ??
    'This is a research tool, not a compliance screening tool. OFAC’s official Sanctions List Search is the authoritative source for sanctions screening; RAGtime’s copy of the SDN and consolidated lists lags OFAC’s publication and must not be used to clear, block, or flag any person or transaction.'
  return (
    <aside className="border-b border-amber-400/40 bg-amber-500/10 px-6 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
      <span className="font-semibold">Not a screening tool. </span>
      {note}{' '}
      <a
        href="https://sanctionssearch.ofac.treas.gov/"
        target="_blank"
        rel="noopener noreferrer"
        className="whitespace-nowrap font-medium underline underline-offset-2 hover:opacity-80"
      >
        OFAC Sanctions List Search ↗
      </a>
    </aside>
  )
}

/**
 * Header band. The date tile is "List data as of" — the copy-freshness
 * stamp, labeled as exactly that (never a designation date; the corpus has
 * none).
 */
function SanctionsHeader({
  spoke,
  entityFacets,
  guidanceFacets,
  frFacets,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  entityFacets: SanctionsEntityFacets | undefined
  guidanceFacets: SanctionsGuidanceFacets | undefined
  frFacets: SanctionsFrFacets | undefined
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
          label="Listed entries"
          value={entityFacets?.entity_count}
          loading={loading}
        />
        <HoldingTile
          label="OFAC guidance docs"
          value={guidanceFacets?.document_count}
          loading={loading}
        />
        <HoldingTile
          label="FR sanctions docs"
          value={frFacets?.document_count}
          loading={loading}
        />
        <HoldingTile
          label="List data as of"
          stringValue={entityFacets?.data_as_of ?? undefined}
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
