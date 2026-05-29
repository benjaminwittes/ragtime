import { useEffect, useState } from 'react'
import {
  AMA_CONFIRM_THRESHOLD_CENTS,
  type UscAmaPlan,
  type UscAmaScope,
  type UscAmaSynthesis,
  type UscFacets,
  type UscFilterFields,
  type UscFilterResult,
  type UscSectionDisplayRow,
  fetchUscFacets,
  runUscExecute,
  runUscFilter,
  runUscPlan,
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
import { UscAmaResult } from './UscAmaResult'
import { UscFilterForm } from './UscFilterForm'
import { UscResultsList } from './UscResultsList'
import { UscSectionDetailSheet } from './UscSectionDetailSheet'

/**
 * USC spoke shell. Two query modes per brief #3 §3:
 *  - manual_filter: keyword + metadata + hierarchy filtering.
 *  - claude_ama: the three co-equal flagships (Legality A / Authority B /
 *    Topical C synthesis), all served through one mode whose planner picks
 *    output_mode per question shape — the "no query-architecture buttons"
 *    principle.
 *
 * v1 ships single-corpus AI. Cross-corpus joins (USC ↔ CFR / OLC /
 * litigation), the definitional layer, the curated scopes library, and
 * historical versioning per brief #3 §6 are all deferred — the planner
 * surfaces the Authority-synthesis cross-corpus limitation in a candor
 * note when the user asks a "Can the President do X" type question.
 *
 * Summarize-one-section action lives on the detail sheet, not in the
 * mode selector.
 */
export function UscSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<UscFacets | undefined>(undefined)
  const [holdings, setHoldings] = useState<CorpusHoldings | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchUscFacets()
        if (cancelled) return
        setFacets(f)
        const h: CorpusHoldings = {
          counts: { sections: f.section_count, titles: f.titles.length },
          coverage: `All ${f.titles.length} titles · release point ${f.release_point}`,
          lastUpdated: f.release_point,
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
  const [rows, setRows] = useState<UscSectionDisplayRow[] | undefined>(undefined)
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
    plan: UscAmaPlan
    question: string
  } | null>(null)
  const [amaSynthesis, setAmaSynthesis] = useState<UscAmaSynthesis | null>(null)
  const [amaError, setAmaError] = useState<string | undefined>(undefined)
  const [amaLoading, setAmaLoading] = useState(false)
  const [amaResultPlan, setAmaResultPlan] = useState<UscAmaPlan | null>(null)

  const enabledModes: QueryMode[] = ['manual_filter']
  if (auth.hasAuth) enabledModes.push('claude_ama')

  function appendLog(line: AmaLogLine) {
    setAmaLog((prev) => [...prev, line])
  }

  function buildAmaScope(): UscAmaScope {
    if (filterIds.length === 0) {
      const total = facets?.section_count ?? 60416
      return {
        is_full_db: true,
        count: total,
        description: `The full USC corpus (${total.toLocaleString()} sections, release point ${facets?.release_point ?? '119-93'}).`,
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
  const [openSection, setOpenSection] = useState<UscSectionDisplayRow | null>(
    null,
  )

  function handleOpenSection(row: UscSectionDisplayRow) {
    setOpenSection(row)
    setDetailOpen(true)
  }

  function handleOpenSectionById(id: number) {
    const placeholder: UscSectionDisplayRow = {
      id,
      title_num: null,
      title_name: null,
      citation: null,
      heading: null,
      section_identifier: null,
      is_positive_law: null,
      status: null,
      text_length: null,
    }
    setOpenSection(placeholder)
    setDetailOpen(true)
  }

  async function handleSubmit(fields: UscFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    try {
      const r: UscFilterResult = await runUscFilter(fields)
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
    let plan: UscAmaPlan
    try {
      plan = await runUscPlan(question, scope, auth.auth)
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

  async function runAmaExecute(plan: UscAmaPlan) {
    if (!auth.auth) return
    appendLog({
      label: 'Step 2/3.',
      message: 'Executing planned queries…',
    })
    try {
      const synth = await runUscExecute(plan.token, auth.auth)
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
      <UscHeader spoke={spoke} holdings={holdings} loading={facetsLoading} error={facetsError} />
      <ModeRow
        modes={spoke.queryModes}
        activeMode={activeMode}
        enabledModes={enabledModes}
        onSelect={setActiveMode}
      />
      {activeMode === 'manual_filter' && (
        <UscFilterForm
          titles={facets?.titles ?? []}
          statuses={facets?.statuses ?? []}
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
        <UscResultsList
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
        <UscAmaResult
          synthesis={amaSynthesis}
          plan={amaResultPlan}
          loading={amaLoading}
          error={amaError}
          onOpenSection={handleOpenSectionById}
        />
      )}
      <UscSectionDetailSheet
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

function UscHeader({
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
        <HoldingTile
          label="Release point"
          stringValue={
            typeof holdings?.lastUpdated === 'string'
              ? holdings.lastUpdated
              : undefined
          }
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
