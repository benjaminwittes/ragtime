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
import type { CorpusSlug } from '@/spokes/types'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'

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
 * digest-only and excluded; federal_register + clemency are embedded but not
 * yet wired server-side).
 */
const SEMANTIC_HUB_CORPORA: readonly CorpusSlug[] = [
  'olc',
  'frus',
  'lawfare',
  'presidential',
  'usc',
  'cfr',
] as const

export function HubAmaSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const { auth, hasAuth } = useAuth()
  const [query, setQuery] = useState('')
  const [activeCorpora, setActiveCorpora] = useState<Set<CorpusSlug>>(
    () => new Set(SEMANTIC_HUB_CORPORA),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<HubAmaPlanResponse | null>(null)

  // Report (execute) state — kept alongside the plan it was synthesized from.
  const [report, setReport] = useState<HubAmaReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  function toggleCorpus(slug: CorpusSlug) {
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
      const corpora = SEMANTIC_HUB_CORPORA.filter((c) =>
        activeCorpora.has(c),
      ) as HubCorpusSlug[]
      const r = await hubAmaPlan(q, corpora)
      setPlan(r)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
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
    </section>
  )
}

function CorpusChip({
  slug,
  label,
  active,
  onToggle,
}: {
  slug: CorpusSlug
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
            const href = `/corpus/${c}?q=${encodeURIComponent(plan.question)}`
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
}: {
  hasAuth: boolean
  report: HubAmaReport | null
  loading: boolean
  error: string | null
  onGenerate: () => void
}) {
  if (report) {
    return (
      <section className="rounded-lg border border-primary/40 bg-card px-5 py-4">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-lawfare-teal">
          Cross-corpus synthesis
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
        {typeof report._cost_cents === 'number' && (
          <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
            {`cost ${(report._cost_cents / 100).toFixed(3)}`}
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

/** Short label for chips and the routing summary. */
function shortLabel(slug: CorpusSlug): string {
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
      return 'Lawfare'
    case 'presidential':
      return 'Presidential'
  }
}

/** Longer label for the routing/handoff chips. */
function longLabel(slug: CorpusSlug): string {
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
      return 'Lawfare'
    case 'presidential':
      return 'Presidential Docs'
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
