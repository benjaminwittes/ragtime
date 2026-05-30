import { useEffect, useState } from 'react'
import {
  type CfrAmaPlan,
  type CfrAmaScope,
  type CfrAmaSynthesis,
  type CfrFacets,
  type CfrFilterFields,
  type CfrFilterResult,
  type CfrSectionDisplayRow,
  fetchCfrFacets,
  runCfrExecute,
  runCfrFilter,
  runCfrPlan,
} from '@/lib/worker-client'
import { useDocs } from '@/docs/DocsContext'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { isAmaPreflightSkipped } from '@/lib/ama-preflight-skip'
import type { CorpusHoldings, CorpusSpoke, QueryMode } from '../types'
import { AmaPreflight } from '../components/AmaPreflight'
import { BackToHubLink } from '../components/BackToHubLink'
import { ClaudeAmaForm, type AmaLogLine } from '../components/ClaudeAmaForm'
import { ModeRow } from '../components/ModeRow'
import { CfrAmaResult } from './CfrAmaResult'
import { CfrFilterForm } from './CfrFilterForm'
import { CfrResultsList } from './CfrResultsList'
import { CfrSectionDetailSheet } from './CfrSectionDetailSheet'

/**
 * CFR spoke shell. Two query modes per brief #4 §3:
 *  - manual_filter: keyword + metadata + hierarchy filtering.
 *  - claude_ama: three co-equal flagships (Compliance A / Authority B /
 *    Framework C synthesis), all served through one mode whose planner
 *    picks output_mode per question shape ("no query-architecture
 *    buttons").
 *
 * v1 ships single-corpus AI. Cross-corpus joins (USC↔CFR / CFR↔OLC /
 * CFR↔litigation / CFR↔FR), the definitional layer, the curated scopes
 * library, and the agency-as-top-level-browse primitive per brief #4 §6
 * are deferred — the planner surfaces cross-corpus and definitional-
 * layer limitations in candor_notes when relevant.
 */
export function CfrSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<CfrFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchCfrFacets()
        if (cancelled) return
        setFacets(f)
        const h: CorpusHoldings = {
          counts: {
            sections: f.section_count,
            titles: f.titles.length,
            reserved: f.reserved_count,
          },
          coverage: `All ${f.titles.length} titles · current as of ${f.up_to_date_as_of}`,
          lastUpdated: f.up_to_date_as_of,
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
  const [rows, setRows] = useState<CfrSectionDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [filterIds, setFilterIds] = useState<number[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  // AMA state.
  const [activeMode, setActiveMode] = useState<QueryMode>('manual_filter')
  const [amaLog, setAmaLog] = useState<AmaLogLine[]>([])
  const [pendingPlan, setPendingPlan] = useState<{
    plan: CfrAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<CfrAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<CfrAmaPlan | null>(null)

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): CfrAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.section_count ?? 227554
      return {
        is_full_db: true,
        count: total,
        description: `The full CFR corpus (${total.toLocaleString()} sections, currency varies per section${facets?.up_to_date_as_of ? ` (latest = ${facets.up_to_date_as_of})` : ''}).`,
      }
    }
    return {
      section_ids: filterIds,
      is_full_db: false,
      count: filterIds.length,
      description: `${filterIds.length.toLocaleString()} sections from the current filter.`,
    }
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const [openSection, setOpenSection] = useState<CfrSectionDisplayRow | null>(
    null,
  )

  /** Open a section in the detail panel. PR 4v unified the manual-filter
   *  and AMA cited-list contracts to pass full rows (previously the AMA
   *  list passed id-only and the handler synthesized a placeholder, since
   *  cited items rendered as "§N" stubs; now they're metadata-rich rows
   *  from items-by-ids). */
  function handleOpenSection(row: CfrSectionDisplayRow) {
    setOpenSection(row)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: CfrFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: CfrFilterResult = await runCfrFilter(fields)
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
    let plan: CfrAmaPlan
    try {
      plan = await runCfrPlan(question, scope, auth.auth)
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

    // PR 4w: pre-flight on every query unless user opted out. See
    // OlcSpokeShell for full rationale.
    if (!isAmaPreflightSkipped()) {
      setPendingPlan({ plan, question })
      return
    }
    await runAmaExecute(plan)
  }

  async function runAmaExecute(plan: CfrAmaPlan) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runCfrExecute(plan.token, auth.auth)
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
      <CfrHeader
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
        <CfrFilterForm
          titles={facets?.titles ?? []}
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
        <CfrResultsList
          rows={rows}
          count={count}
          loading={queryLoading}
          error={queryError}
          hasRun={hasRun}
          executedSql={executedSql}
          onOpenSection={handleOpenSection}
        />
      )}
      {activeMode === 'claude_ama' && (
        <CfrAmaResult
          synthesis={amaSynthesis}
          plan={amaResultPlan}
          loading={amaLoading}
          error={amaError}
          onOpenSection={handleOpenSection}
        />
      )}
      <CfrSectionDetailSheet
        row={openSection}
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

function CfrHeader({
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
        <HoldingTile label="Sections" value={holdings?.counts.sections} loading={loading} />
        <HoldingTile label="Titles" value={holdings?.counts.titles} loading={loading} />
        <HoldingTile label="Reserved" value={holdings?.counts.reserved} loading={loading} />
        <HoldingTile
          label="Up to date"
          stringValue={
            typeof holdings?.lastUpdated === 'string'
              ? holdings.lastUpdated
              : undefined
          }
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
