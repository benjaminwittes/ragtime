import { useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { downloadCsv } from '@/lib/export-csv'
import { downloadNarrativePdf } from '@/lib/export-pdf'
import { USC_COLUMNS } from '@/lib/export-columns'
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
  // Usage log (ragtime-usage-log-feedback).
  const [amaInteractionId, setAmaInteractionId] = useState<string | null>(null)
  const [amaQuestion, setAmaQuestion] = useState('')

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

  /** Open a section in the detail panel. PR 4v unified the manual-filter
   *  and AMA cited-list contracts to pass full rows (previously the AMA
   *  list passed id-only and the handler synthesized a placeholder, since
   *  cited items rendered as "§N" stubs; now they're metadata-rich rows
   *  from items-by-ids). */
  function handleOpenSection(row: UscSectionDisplayRow) {
    setOpenSection(row)
    setDetailOpen(true)
  }

  // Hub → workspace carryover (`?q=`): seed the filter field + auto-run once
  // on mount so we land on the responsive set, not the full corpus. Ref-guarded
  // against StrictMode's dev double-invoke.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'usc',
          mode: 'manual_filter',
          question: fields.search ?? fields.citation ?? fields.heading ?? '(structured filter)',
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

    // PR 4w: pre-flight on every query unless user opted out. See
    // OlcSpokeShell for full rationale.
    if (!isAmaPreflightSkipped()) {
      setPendingPlan({ plan, question })
      return
    }
    await runAmaExecute(plan, question)
  }

  async function runAmaExecute(plan: UscAmaPlan, question: string) {
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
    downloadCsv('ragtime-usc-results.csv', {
      title: 'RAGtime — USC export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: USC_COLUMNS,
      rows,
    })
  }

  function downloadAmaPdf() {
    if (!amaSynthesis?.answer_markdown) return
    const cited = amaSynthesis.section_ids?.length
    downloadNarrativePdf({
      title: 'RAGtime Analysis',
      subtitle: spoke.title,
      metaRows: [
        { key: 'Question', value: amaQuestion },
        ...(cited != null
          ? [{ key: 'Sections cited', value: cited.toLocaleString() }]
          : []),
      ],
      markdown: amaSynthesis.answer_markdown,
    })
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
          <UscResultsList
            rows={rows}
            count={count}
            loading={queryLoading}
            error={queryError}
            hasRun={hasRun}
            executedSql={executedSql}
            onOpenSection={handleOpenSection}
          />
        </>
      )}
      {activeMode === 'claude_ama' && (
        <>
          {amaSynthesis?.answer_markdown && !amaLoading && (
            <ExportBar onPdf={downloadAmaPdf} />
          )}
          <UscAmaResult
            synthesis={amaSynthesis}
            plan={amaResultPlan}
            loading={amaLoading}
            error={amaError}
            onOpenSection={handleOpenSection}
          />
        </>
      )}
      {activeMode === 'claude_ama' && amaSynthesis && amaInteractionId && (
        <UsageLogAnnotation
          auth={auth.auth}
          record={{
            interaction_id: amaInteractionId,
            surface: 'usc',
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
            cited_ids: amaSynthesis.section_ids,
            candor_notes: amaSynthesis.candor_notes,
            cost_cents:
              (amaResultPlan?._cost_cents ?? 0) + (amaSynthesis._cost_cents ?? 0),
          }}
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
