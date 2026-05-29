import { useEffect, useState } from 'react'
import {
  AMA_CONFIRM_THRESHOLD_CENTS,
  type FrusAmaPlan,
  type FrusAmaScope,
  type FrusAmaSynthesis,
  type FrusDocumentDisplayRow,
  type FrusFacets,
  type FrusFilterFields,
  type FrusFilterResult,
  fetchFrusFacets,
  runFrusExecute,
  runFrusFilter,
  runFrusPlan,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import type { CorpusHoldings, CorpusSpoke, QueryMode } from '../types'
import { AmaPreflight } from '../components/AmaPreflight'
import { ClaudeAmaForm, type AmaLogLine } from '../components/ClaudeAmaForm'
import { ModeRow } from '../components/ModeRow'
import { FrusAmaResult } from './FrusAmaResult'
import { FrusDocumentDetailSheet } from './FrusDocumentDetailSheet'
import { FrusFilterForm } from './FrusFilterForm'
import { FrusResultsList } from './FrusResultsList'

/**
 * FRUS spoke shell. Two query modes per brief #5 §3:
 *  - manual_filter: structured filter + document detail.
 *  - claude_ama: the asymmetric three-flagship surface — narrative synthesis
 *    (paradigmatic) + coverage/existence + specific-document retrieval, all
 *    served through one mode whose planner picks output_mode per question
 *    shape ("no query-architecture buttons" — feedback memory 2026-05-28).
 *
 * The summarize-this-document action lives on the detail sheet, not in the
 * mode selector.
 *
 * Scope handling: when filter rows have been produced, the AMA call passes
 * those document ids as scope. The Worker caps inline scope at 25K; over
 * that the executor refuses and asks the user to narrow further.
 */
export function FrusSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<FrusFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchFrusFacets()
        if (cancelled) return
        setFacets(f)
        const h: CorpusHoldings = {
          counts: {
            documents: f.document_count,
            volumes: f.volume_count,
            with_docs: f.volumes_with_docs,
          },
          coverage: `${f.earliest} → ${f.latest}`,
          lastUpdated: f.latest,
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
  const [rows, setRows] = useState<FrusDocumentDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  // All matching ids (separate from `rows`, which is capped at 10K). Used
  // as scope when the user runs AMA against the filter result.
  const [filterIds, setFilterIds] = useState<number[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // AMA state.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: FrusAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<FrusAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<FrusAmaPlan | null>(null)

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): FrusAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.document_count ?? 314483
      return {
        is_full_db: true,
        count: total,
        description: `The full FRUS corpus (${total.toLocaleString()} documents across ${(facets?.volumes_with_docs ?? 552).toLocaleString()} volumes).`,
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
  const [openDocument, setOpenDocument] = useState<FrusDocumentDisplayRow | null>(
    null,
  )

  /** Open a document in the detail panel. Used by both manual-filter rows
   *  and AMA cited rows (PR 4v unified both — cited rows are now metadata-
   *  rich rather than id-only stubs, so the handler receives full row
   *  data uniformly). */
  function handleOpenDocument(row: FrusDocumentDisplayRow) {
    setOpenDocument(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: FrusFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: FrusFilterResult = await runFrusFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
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
    let plan: FrusAmaPlan
    try {
      plan = await runFrusPlan(question, scope, auth.auth)
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

    if (plan.estimated_cost_cents > AMA_CONFIRM_THRESHOLD_CENTS) {
      setPendingPlan({ plan, question })
      return
    }
    await runAmaExecute(plan)
  }

  async function runAmaExecute(plan: FrusAmaPlan) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runFrusExecute(plan.token, auth.auth)
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
    const { plan } = pendingPlan
    setPendingPlan(null)
    await runAmaExecute(plan)
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FrusHeader
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
      />
      {activeMode === 'manual_filter' && (
        <FrusFilterForm
          subSeries={facets?.sub_series ?? []}
          classifications={facets?.classifications ?? []}
          loading={queryLoading}
          onSubmit={handleSubmit}
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
        <FrusResultsList
          rows={rows}
          count={count}
          loading={queryLoading}
          error={queryError}
          hasRun={hasRun}
          executedSql={executedSql}
          onOpenDocument={handleOpenDocument}
        />
      )}
      {activeMode === 'claude_ama' && (
        <FrusAmaResult
          synthesis={amaSynthesis}
          plan={amaResultPlan}
          loading={amaLoading}
          error={amaError}
          onOpenDocument={handleOpenDocument}
        />
      )}
      <FrusDocumentDetailSheet
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

function FrusHeader({
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
  const docs = holdings?.counts.documents
  const volumes = holdings?.counts.volumes
  const withDocs = holdings?.counts.with_docs
  return (
    <header className="border-b border-border bg-card px-6 py-5">
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
        <HoldingTile label="Documents" value={docs} loading={loading} />
        <HoldingTile label="Volumes" value={volumes} loading={loading} />
        <HoldingTile
          label="With docs"
          value={withDocs}
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
