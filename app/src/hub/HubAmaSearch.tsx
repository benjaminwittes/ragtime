import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { toHref } from '@/lib/routing'
import {
  type HubAmaPlanResponse,
  type HubAmaReport,
  type HubCorpusSlug,
  HubAmaError,
  hubAmaExecute,
  hubAmaPlan,
} from '@/lib/worker-client'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { UsageLogAnnotation } from '@/spokes/components/UsageLogAnnotation'

/**
 * Hub cross-corpus semantic AMA (features stream #3, step 3 — the "ask across
 * everything" surface).
 *
 * The semantic counterpart to {@link HubKeywordSearch}. Because every corpus
 * shares one embedding space, cosine similarity is comparable ACROSS corpora,
 * so this leads with a single UNIFIED cross-corpus ranking — the thing the
 * keyword hub structurally cannot do (FTS scores aren't comparable across
 * tables, so it can only group).
 *
 * Two-phase, free-base / paid-report (mirrors the spoke plan/execute):
 *   1. plan (free)    — on submit, embeds + fans semantic_search across the
 *      embedded corpora, returns the unified ranking + per-corpus groups +
 *      routing counts. Always shown.
 *   2. execute (paid) — when the question is question-shaped, a "Generate a
 *      cited answer" CTA synthesizes a report over exactly the surfaced
 *      passages. Gated on auth (BYOK / paid / demo); charged.
 *
 * The corpus set mirrors the Worker's SEMANTIC_CORPORA (litigation is
 * digest-only and excluded). "commentary" is the Worker's federated fan-out
 * slug over both publications (Lawfare + Executive Functions) — swapped in for
 * the standalone "lawfare" slug alongside the commentary-spoke cutover, so hub
 * results route to /corpus/commentary.
 */
const SEMANTIC_HUB_CORPORA: readonly HubCorpusSlug[] = [
  'olc',
  'frus',
  'commentary',
  'presidential',
  // Clemency is its own semantic corpus (18,914 chunks) surfaced inside the
  // Presidential spoke — its handoff chip routes there.
  'clemency',
  'fr',
  'usc',
  'cfr',
  'congress',
] as const

export function HubAmaSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const { auth, hasAuth } = useAuth()
  const [query, setQuery] = useState('')
  const [activeCorpora, setActiveCorpora] = useState<Set<HubCorpusSlug>>(
    () => new Set(SEMANTIC_HUB_CORPORA),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<HubAmaPlanResponse | null>(null)
  // One interaction id per submitted question: the plan auto-log and the
  // report log upsert onto the SAME usage_log row (merge by interaction_id),
  // and the annotation bar joins its rating/note to it too.
  const [interactionId, setInteractionId] = useState<string | null>(null)

  // Report (execute) state — kept alongside the plan it was synthesized from.
  const [report, setReport] = useState<HubAmaReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  function toggleCorpus(slug: HubCorpusSlug) {
    setActiveCorpora((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || activeCorpora.size === 0) return
    setLoading(true)
    setError(null)
    setReport(null)
    setReportError(null)
    try {
      const corpora = SEMANTIC_HUB_CORPORA.filter((c) => activeCorpora.has(c))
      const r = await hubAmaPlan(q, corpora)
      setPlan(r)
      const iid = newInteractionId()
      setInteractionId(iid)
      void postUsageLog(
        {
          interaction_id: iid,
          surface: 'hub',
          mode: 'ama',
          question: q,
          plan: {
            corpora,
            output_mode: r.output_mode,
            routing: r.routing,
            n: r.results.length,
          },
        },
        auth,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateReport() {
    if (!plan || !auth) return
    setReportLoading(true)
    setReportError(null)
    try {
      const r = await hubAmaExecute(plan.token, auth)
      setReport(r)
      // Merge the paid synthesis onto the plan's usage_log row (same
      // interaction_id) — before this, hub reports left no trace at all.
      if (interactionId) {
        void postUsageLog(
          {
            interaction_id: interactionId,
            surface: 'hub',
            mode: 'ama',
            question: plan.question,
            answer_markdown: r.answer_markdown,
            candor_notes: r.candor_notes,
            cited_ids: r.sources,
            cost_cents: r._cost_cents ?? null,
            // Router trace: which branch answered + branch B's executed
            // queries (label/SQL/counts — the rows themselves stay client-side).
            // MUST be an ARRAY: the Worker's log validator drops non-array
            // query_summary (found via the 7/11 tire kicks — branch was null
            // on every logged row). Row 0 is the router; rows 1+ the queries,
            // mirroring the spoke convention.
            query_summary: [
              {
                label: '__router__',
                branch: r.branch ?? 'synthesis',
                handoff_corpus: r.handoff?.corpus ?? null,
              },
              ...(r.queries ?? []).map((q) => ({
                label: q.label,
                sql: q.sql,
                total_rows: q.total_rows,
                error: q.error,
              })),
            ],
          },
          auth,
        )
      }
    } catch (err) {
      if (err instanceof HubAmaError && err.code === 'plan_expired') {
        setReportError('This search expired — re-run the question to generate a report.')
      } else {
        setReportError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setReportLoading(false)
    }
  }

  const canSubmit = !loading && query.trim().length > 0 && activeCorpora.size > 0

  return (
    <section className="pt-7 pb-2">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask across statutes, regs, opinions, cases, and analysis…"
            disabled={loading}
            maxLength={500}
            aria-label="Cross-corpus semantic question"
            className={cn(
              'block w-full rounded-lg border-[1.5px] border-primary bg-card py-4 pl-5 pr-14 font-serif text-xl text-foreground shadow-sm',
              'placeholder:text-lawfare-muted focus:outline-none focus:ring-2 focus:ring-primary/30',
              loading && 'cursor-not-allowed opacity-60',
            )}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Ask"
            className={cn(
              'absolute right-2 top-2 bottom-2 flex w-11 items-center justify-center rounded-md bg-primary text-lg text-primary-foreground transition',
              canSubmit ? 'hover:opacity-90' : 'cursor-not-allowed opacity-40',
            )}
          >
            {loading ? '…' : '→'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] text-lawfare-muted">
            Semantic search — ranked across:
          </span>
          {SEMANTIC_HUB_CORPORA.map((slug) => (
            <CorpusChip
              key={slug}
              slug={slug}
              label={shortLabel(slug)}
              active={activeCorpora.has(slug)}
              onToggle={() => toggleCorpus(slug)}
            />
          ))}
        </div>
      </form>

      {error && !plan && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {plan && (
        <HubAmaResults
          plan={plan}
          loading={loading}
          onNavigate={onNavigate}
          // report
          hasAuth={hasAuth}
          report={report}
          reportLoading={reportLoading}
          reportError={reportError}
          onGenerateReport={handleGenerateReport}
        />
      )}

      {/* Inline ★/note — joins the logger's assessment to this interaction's
          trace (internal builds / demo only; renders nothing otherwise). Keyed
          by interaction so the bar resets with each new question. */}
      {plan && interactionId && (
        <UsageLogAnnotation
          key={interactionId}
          record={{
            interaction_id: interactionId,
            surface: 'hub',
            mode: 'ama',
            question: plan.question,
            answer_markdown: report?.answer_markdown ?? null,
            candor_notes: report?.candor_notes,
            cited_ids: report?.sources,
            cost_cents: report?._cost_cents ?? null,
          }}
          auth={auth}
        />
      )}
    </section>
  )
}

function CorpusChip({
  slug,
  label,
  active,
  onToggle,
}: {
  slug: HubCorpusSlug
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`Toggle ${slug}`}
      onClick={onToggle}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/40',
      )}
    >
      {label}
    </button>
  )
}

function HubAmaResults({
  plan,
  loading,
  onNavigate,
  hasAuth,
  report,
  reportLoading,
  reportError,
  onGenerateReport,
}: {
  plan: HubAmaPlanResponse
  loading: boolean
  onNavigate: (path: string) => void
  hasAuth: boolean
  report: HubAmaReport | null
  reportLoading: boolean
  reportError: string | null
  onGenerateReport: () => void
}) {
  const total = plan.results.length
  const corporaWithHits = (Object.keys(plan.routing) as HubCorpusSlug[]).filter(
    (c) => (plan.routing[c] ?? 0) > 0,
  )

  return (
    <section className="mt-6 space-y-4" aria-busy={loading}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold">
          {total > 0
            ? `${total.toLocaleString()} responsive passage${total === 1 ? '' : 's'}`
            : 'No matches'}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {corporaWithHits.length > 0
            ? corporaWithHits
                .map((c) => `${plan.routing[c]} ${shortLabel(c)}`)
                .join(' · ')
            : 'searched the semantic corpora'}
        </p>
      </div>

      {/* Report CTA / report — question-shaped queries warrant a cited answer. */}
      {plan.output_mode === 'question' && (
        <ReportPanel
          hasAuth={hasAuth}
          report={report}
          loading={reportLoading}
          error={reportError}
          onGenerate={onGenerateReport}
          question={plan.question}
          onNavigate={onNavigate}
        />
      )}

      {/* The unified cross-corpus ranking — the semantic-first base layer. */}
      {total > 0 && (
        <ol className="space-y-2">
          {plan.results.map((r) => (
            <li
              key={`${r.corpus}:${r.id}`}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-sm font-semibold text-foreground">
                  {r.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-lawfare-teal">
                  {shortLabel(r.corpus)} · {r.similarity.toFixed(2)}
                </span>
              </div>
              {(r.context || r.date) && (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {[r.context, r.date].filter(Boolean).join(' · ')}
                </p>
              )}
              {r.snippet && (
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  {r.snippet}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Routing handoff — jump into a corpus workspace to keep digging. */}
      {corporaWithHits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-lawfare-line pt-3">
          <span className="text-[11px] text-lawfare-muted">Keep digging:</span>
          {corporaWithHits.map((c) => {
            // Clemency has no spoke of its own — it lives inside the
            // Presidential spoke, so its handoff routes there.
            const spoke = c === 'clemency' ? 'presidential' : c
            const href = `/corpus/${spoke}?q=${encodeURIComponent(plan.question)}`
            return (
              <a
                key={c}
                href={toHref(href)}
                onClick={(e) => {
                  if (
                    e.button === 0 &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    !e.altKey
                  ) {
                    e.preventDefault()
                    onNavigate(href)
                  }
                }}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-primary transition-colors hover:border-primary"
              >
                {longLabel(c)} ({plan.routing[c]}) →
              </a>
            )
          })}
        </div>
      )}
    </section>
  )
}

/**
 * The paid synthesis layer. Before generation: a CTA (auth-gated). After:
 * the cited answer + candor notes + a cost/balance line, mirroring the spoke
 * AMA result register.
 */
function ReportPanel({
  hasAuth,
  report,
  loading,
  error,
  onGenerate,
  question,
  onNavigate,
}: {
  hasAuth: boolean
  report: HubAmaReport | null
  loading: boolean
  error: string | null
  onGenerate: () => void
  question: string
  onNavigate: (path: string) => void
}) {
  if (report) {
    const branch = report.branch ?? 'synthesis'
    return (
      <section className="rounded-lg border border-primary/40 bg-card px-5 py-4">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-lawfare-teal">
          {branch === 'count'
            ? 'Cross-corpus computation'
            : branch === 'honesty'
              ? 'Cross-corpus synthesis — open question'
              : 'Cross-corpus synthesis'}
        </h3>
        {report.candor_notes.length > 0 && (
          <aside className="mb-3 rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <ul className="list-disc pl-5">
              {report.candor_notes.map((n, i) => (
                <li key={i} className="leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          </aside>
        )}
        <article className="space-y-3 text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {report.answer_markdown}
          </ReactMarkdown>
        </article>

        {/* Branch B's dual output: the counted dataset — every query, its
            count, and the rows it counted. The number is checkable, not
            merely asserted. */}
        {branch === 'count' && report.queries && report.queries.length > 0 && (
          <section className="mt-4 border-t border-border pt-3">
            <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-lawfare-teal">
              The counted dataset
            </h4>
            {report.approach_summary && (
              <p className="mb-2 text-xs italic text-muted-foreground">
                {report.approach_summary}
              </p>
            )}
            <div className="space-y-2">
              {report.queries.map((q, i) => (
                <details
                  key={i}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <summary className="cursor-pointer text-xs font-medium text-foreground">
                    {q.label}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {q.error
                        ? `failed — ${q.error}`
                        : `${q.total_rows.toLocaleString()} row${q.total_rows === 1 ? '' : 's'}${q.was_truncated ? ` (showing ${q.rows.length})` : ''}`}
                    </span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {q.sql}
                  </pre>
                  {q.rows.length > 0 && <CountRowsTable rows={q.rows} />}
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Confidence-gated spoke handoff — offered, never forced. */}
        {report.handoff && (
          <p className="mt-3 text-xs text-muted-foreground">
            {report.handoff.reason ? `${report.handoff.reason} — ` : ''}
            <a
              href={toHref(handoffHref(report.handoff.corpus, question))}
              onClick={(e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault()
                  onNavigate(handoffHref(report.handoff!.corpus, question))
                }
              }}
              className="text-primary hover:underline"
            >
              likely a better answer in the {longLabel(report.handoff.corpus)} workspace →
            </a>
          </p>
        )}
        {/* Cost line only when there was a real ledger charge — demo and BYOK
            sessions return 0 (demo isn't billed; BYOK bills the user's own
            provider key), where "cost 0.000" just reads as broken. */}
        {typeof report._cost_cents === 'number' && report._cost_cents > 0 && (
          <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
            {`cost $${(report._cost_cents / 100).toFixed(3)}`}
            {typeof report._balance_cents === 'number'
              ? ` · balance $${(report._balance_cents / 100).toFixed(2)}`
              : ''}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/[0.03] px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          Synthesize a cited answer from these sources
        </p>
        <p className="text-xs text-muted-foreground">
          {hasAuth
            ? 'A research-librarian report, grouped by corpus, over exactly the passages above.'
            : 'Set up access (top right) to generate a cited report — or read the ranked sources below for free.'}
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!hasAuth || loading}
        className={cn(
          'shrink-0 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition',
          !hasAuth || loading ? 'cursor-not-allowed opacity-40' : 'hover:opacity-90',
        )}
      >
        {loading ? 'Synthesizing…' : 'Generate report'}
      </button>
    </section>
  )
}

/** Spoke path for a routing handoff (clemency lives inside the Presidential spoke). */
function handoffHref(corpus: HubCorpusSlug, question: string): string {
  const spoke = corpus === 'clemency' ? 'presidential' : corpus
  return `/corpus/${spoke}?q=${encodeURIComponent(question)}`
}

/**
 * Generic table over one branch-B query's rows — the drillable half of the
 * dual output. Columns come from the row keys; display capped at 25 rows
 * (total_rows stays honest in the summary line).
 */
function CountRowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const display = rows.slice(0, 25)
  const cols = Object.keys(display[0] ?? {})
  if (cols.length === 0) return null
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left font-mono text-[11px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {cols.map((c) => (
              <th key={c} className="py-1 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((r, i) => (
            <tr key={i} className="border-b border-border/40 align-top">
              {cols.map((c) => (
                <td key={c} className="py-1 pr-4 text-foreground">
                  {r[c] == null ? '—' : String(r[c]).slice(0, 200)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          …and {(rows.length - 25).toLocaleString()} more returned rows
        </p>
      )}
    </div>
  )
}

/** Short label for chips and the routing summary. */
function shortLabel(slug: HubCorpusSlug): string {
  switch (slug) {
    case 'litigation':
      return 'litigation'
    case 'usc':
      return 'USC'
    case 'cfr':
      return 'CFR'
    case 'olc':
      return 'OLC'
    case 'frus':
      return 'FRUS'
    case 'lawfare':
    case 'commentary':
      return 'Commentary'
    case 'presidential':
      return 'Presidential'
    case 'clemency':
      return 'Clemency'
    case 'fr':
      return 'Fed. Register'
    case 'congress':
      return 'Congress'
  }
}

/** Longer label for the routing/handoff chips. */
function longLabel(slug: HubCorpusSlug): string {
  switch (slug) {
    case 'litigation':
      return 'Federal litigation'
    case 'usc':
      return 'U.S. Code'
    case 'cfr':
      return 'CFR'
    case 'olc':
      return 'OLC opinions'
    case 'frus':
      return 'FRUS'
    case 'lawfare':
    case 'commentary':
      return 'Commentary'
    case 'presidential':
      return 'Presidential Docs'
    case 'clemency':
      return 'Clemency grants'
    case 'fr':
      return 'Federal Register'
    case 'congress':
      return 'Congress'
  }
}

/** Markdown register — matches the spoke AMA result styles for consistency. */
const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-2xl font-semibold mt-2 mb-3" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="font-serif text-xl font-semibold mt-5 mb-2 border-b border-border pb-1"
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-base font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 space-y-1" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 space-y-1" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]" {...props} />
  ),
}
