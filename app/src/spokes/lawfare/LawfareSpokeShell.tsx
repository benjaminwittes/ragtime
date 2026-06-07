import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type LawfareAmaPlan,
  type LawfareAmaScope,
  type LawfareAmaSynthesis,
  type LawfareArticleDisplayRow,
  type LawfareFacets,
  type LawfareFilterFields,
  type LawfareFilterResult,
  fetchLawfareFacets,
  runLawfareExecute,
  runLawfareFilter,
  runLawfarePlan,
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
import { UsageLogAnnotation } from '../components/UsageLogAnnotation'
import { downloadCsv } from '@/lib/export-csv'
import { downloadNarrativePdf } from '@/lib/export-pdf'
import { LAWFARE_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { LawfareAmaResult } from './LawfareAmaResult'
import { LawfareArticleDetailSheet } from './LawfareArticleDetailSheet'
import { LawfareFilterForm } from './LawfareFilterForm'
import { LawfareResultsList } from './LawfareResultsList'

/**
 * Lawfare spoke shell — the platform's first COMMENTARY corpus. Two query
 * modes (mirrors OLC):
 *  - manual_filter: structured filter (keyword + author + topic + content
 *    type + date range + include-roundups toggle) + article reader detail.
 *  - claude_ama: narrative synthesis ("what has Lawfare argued about X").
 *    Plan/execute over the archive; output is attribution-forward prose +
 *    cited piece ids.
 *
 * The "summarize this piece" surface lives on the detail sheet, not in the
 * mode selector.
 *
 * Scope for AMA: when filter rows have been produced, the AMA call passes those
 * article ids as scope so synthesis runs over the narrowed set; otherwise scope
 * is the full corpus.
 */
export function LawfareSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<LawfareFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchLawfareFacets()
        if (cancelled) return
        setFacets(f)
        const articles =
          f.content_types.find((c) => c.value === 'article')?.count ?? 0
        const podcasts =
          f.content_types.find((c) => c.value === 'podcast')?.count ?? 0
        const newsletters =
          f.content_types.find((c) => c.value === 'newsletter')?.count ?? 0
        const h: CorpusHoldings = {
          counts: { items: f.document_count },
          coverage: `${f.earliest} → ${f.latest}`,
          lastUpdated: f.latest,
          provenance: {
            articles,
            podcasts,
            newsletters,
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
  const [rows, setRows] = useState<LawfareArticleDisplayRow[] | undefined>(
    undefined,
  )
  const [count, setCount] = useState<number | undefined>(undefined)
  // All matching ids (separate from `rows`, which is capped for display).
  // Used as scope when the user runs AMA against the filter result.
  const [filterIds, setFilterIds] = useState<string[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // AMA state.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: LawfareAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] =
    useState<LawfareAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<LawfareAmaPlan | null>(null)
  // Usage log.
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): LawfareAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.document_count ?? 0
      return {
        is_full_db: true,
        count: total,
        description: `The full Lawfare archive (${total.toLocaleString()} pieces).`,
      }
    }
    return {
      article_ids: filterIds,
      is_full_db: false,
      count: filterIds.length,
      description: `${filterIds.length.toLocaleString()} pieces from the current filter.`,
    }
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const [openArticle, setOpenArticle] =
    useState<LawfareArticleDisplayRow | null>(null)

  /** Open a piece in the reader. Used by both the manual-filter results list
   *  and the AMA cited list. */
  function handleOpenArticle(row: LawfareArticleDisplayRow) {
    setOpenArticle(row)
    setDetailOpen(true)
  }

  // Hub → workspace carryover (`?q=`): seed the keyword field + auto-run once
  // on mount so we land on the responsive set, not the full corpus.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ q: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(fields: LawfareFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: LawfareFilterResult = await runLawfareFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'lawfare',
          mode: 'manual_filter',
          question:
            fields.q ??
            fields.author_slug ??
            fields.topic_slug ??
            '(structured filter)',
          plan: { fields, executed_sql: r.executed_sql },
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
    let plan: LawfareAmaPlan
    try {
      plan = await runLawfarePlan(question, scope, auth.auth)
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

  async function runAmaExecute(plan: LawfareAmaPlan, question: string) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runLawfareExecute(plan.token, auth.auth)
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
    downloadCsv('ragtime-lawfare-results.csv', {
      title: 'RAGtime — Lawfare export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: LAWFARE_COLUMNS,
      rows,
    })
  }

  function downloadAmaPdf() {
    if (!amaSynthesis?.answer_markdown) return
    const cited = amaSynthesis.article_ids?.length
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
      <LawfareHeader
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
        docSlug="lawfare-narrative-synthesis"
      />
      {activeMode === 'manual_filter' && (
        <LawfareFilterForm
          topAuthors={facets?.top_authors ?? []}
          topics={facets?.topics ?? []}
          contentTypes={facets?.content_types ?? []}
          loading={queryLoading}
          onSubmit={handleSubmit}
          initialSearch={carryover ?? undefined}
        />
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
          {rows && rows.length > 0 && !queryLoading && (
            <ExportBar onCsv={downloadFilterCsv} />
          )}
          <LawfareResultsList
            rows={rows}
            count={count}
            loading={queryLoading}
            error={queryError}
            hasRun={hasRun}
            executedSql={executedSql}
            onOpenArticle={handleOpenArticle}
          />
        </>
      )}
      {activeMode === 'claude_ama' && (
        <>
          {amaSynthesis?.answer_markdown && !amaLoading && (
            <ExportBar onPdf={downloadAmaPdf} />
          )}
          <LawfareAmaResult
            synthesis={amaSynthesis}
            plan={amaResultPlan}
            loading={amaLoading}
            error={amaError}
            onOpenArticle={handleOpenArticle}
          />
        </>
      )}
      {activeMode === 'claude_ama' && amaSynthesis && amaInteractionId && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={{
            interaction_id: amaInteractionId,
            surface: 'lawfare',
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
            cited_ids: amaSynthesis.article_ids,
            candor_notes: amaSynthesis.candor_notes,
            cost_cents:
              (amaResultPlan?._cost_cents ?? 0) +
              (amaSynthesis._cost_cents ?? 0),
          }}
        />
      )}

      <LawfareArticleDetailSheet
        row={openArticle}
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

function LawfareHeader({
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
  const articles = holdings?.provenance?.articles
  const podcasts = holdings?.provenance?.podcasts
  const newsletters = holdings?.provenance?.newsletters
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
        <HoldingTile label="Pieces" value={holdings?.counts.items} loading={loading} />
        <HoldingTile label="Articles" value={articles} loading={loading} />
        <HoldingTile label="Podcasts" value={podcasts} loading={loading} />
        <HoldingTile label="Newsletters" value={newsletters} loading={loading} />
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
