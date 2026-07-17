import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toHref } from '@/lib/routing'
import {
  type HubCorpusSlug,
  type HubKeywordResponse,
  runHubKeyword,
} from '@/lib/worker-client'
import { spokes } from '@/spokes/registry'
import type { CorpusSlug } from '@/spokes/types'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'

/**
 * Hub cross-corpus keyword search (PR 4u).
 *
 * Brief #1's free demo moment. Plain-language input → five parallel FTS
 * queries → grouped-by-corpus results. No LLM. The hub's "stand on its
 * own" base layer, per brief #1 §4b — every query already returns the
 * ranked responsive document set even before the (Phase 2) AI synthesis
 * lands.
 *
 * Layout:
 *   - Search input + (optional) corpus chips to narrow ("just OLC +
 *     litigation"). All chips on by default per brief #1 §2.
 *   - On submit: per-corpus result cards, each with top-5 + total count
 *     + "Open in [X] workspace" link.
 *   - Per-corpus error state: if one corpus's query failed, that card
 *     shows the error; the other corpora still render their results.
 *
 * Not yet here (deferred):
 *   - Click-through from a result item directly to the spoke detail
 *     sheet (would need cross-route detail-open plumbing).
 *   - ?q= prefill carryover so "Open in [X] workspace" lands with the
 *     filter already populated.
 *   - The paid AI synthesis layer (brief #1 Phase 2; needs pgvector).
 */
export function HubKeywordSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const auth = useAuth()
  const [query, setQuery] = useState('')
  const [activeCorpora, setActiveCorpora] = useState<Set<CorpusSlug>>(
    () => new Set(spokes.map((s) => s.slug)),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<HubKeywordResponse | null>(null)
  // The query that produced `response` — carried into the spoke via `?q=` so
  // "Open workspace →" lands on the responsive set, not the full corpus. Held
  // separately from `query` (the live input) so editing the box post-search
  // doesn't desync the carryover from the displayed results.
  const [submittedQuery, setSubmittedQuery] = useState('')

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
    try {
      const r = await runHubKeyword(q, Array.from(activeCorpora) as HubCorpusSlug[])
      setResponse(r)
      setSubmittedQuery(q)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'hub',
          mode: 'keyword',
          question: q,
          plan: {
            corpora: Array.from(activeCorpora),
            per_corpus_counts: Object.fromEntries(
              Object.entries(r.per_corpus).map(([k, v]) => [k, v?.count ?? 0]),
            ),
          },
        },
        auth.auth,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
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
            placeholder="Search the law, the opinions, and the record…"
            disabled={loading}
            maxLength={200}
            aria-label="Cross-corpus keyword search"
            className={cn(
              'block w-full rounded-lg border-[1.5px] border-primary bg-card py-4 pl-5 pr-14 font-serif text-xl text-foreground shadow-sm',
              'placeholder:text-lawfare-muted focus:outline-none focus:ring-2 focus:ring-primary/30',
              loading && 'cursor-not-allowed opacity-60',
            )}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Search"
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
            Free cross-corpus keyword search — in:
          </span>
          {spokes.map((spoke) => (
            <CorpusChip
              key={spoke.slug}
              slug={spoke.slug}
              label={shortLabel(spoke.slug)}
              active={activeCorpora.has(spoke.slug)}
              onToggle={() => toggleCorpus(spoke.slug)}
            />
          ))}
        </div>
      </form>

      {error && !response && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {response && (
        <HubKeywordResults
          response={response}
          query={submittedQuery}
          loading={loading}
          onNavigate={onNavigate}
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

function HubKeywordResults({
  response,
  query,
  loading,
  onNavigate,
}: {
  response: HubKeywordResponse
  query: string
  loading: boolean
  onNavigate: (path: string) => void
}) {
  const corpora = Object.keys(response.per_corpus) as CorpusSlug[]
  const totalCount = corpora.reduce(
    (sum, c) => sum + (response.per_corpus[c]?.count ?? 0),
    0,
  )
  const corporaWithHits = corpora.filter(
    (c) => (response.per_corpus[c]?.count ?? 0) > 0,
  )

  return (
    <section className="mt-6 space-y-4" aria-busy={loading}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold">
          {totalCount > 0
            ? `${totalCount.toLocaleString()} responsive document${totalCount === 1 ? '' : 's'}`
            : 'No matches'}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {corporaWithHits.length > 0
            ? corporaWithHits
                .map((c) => `${response.per_corpus[c]?.count.toLocaleString()} ${shortLabel(c)}`)
                .join(' · ')
            : `searched ${corpora.length} corpora`}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {corpora.map((corpus) => {
          const block = response.per_corpus[corpus]
          if (!block) return null
          return (
            <CorpusResultCard
              key={corpus}
              corpus={corpus}
              block={block}
              query={query}
              onNavigate={onNavigate}
            />
          )
        })}
      </div>
    </section>
  )
}

function CorpusResultCard({
  corpus,
  block,
  query,
  onNavigate,
}: {
  corpus: CorpusSlug
  block: NonNullable<HubKeywordResponse['per_corpus'][CorpusSlug]>
  query: string
  onNavigate: (path: string) => void
}) {
  // Carry the keyword into the spoke so it lands on the responsive set.
  const href = `/corpus/${corpus}?q=${encodeURIComponent(query)}`
  const more = Math.max(0, block.count - block.results.length)
  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-serif text-base font-semibold">
          {longLabel(corpus)}
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {block.count.toLocaleString()} total
          </span>
        </h3>
        <a
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
          className="text-xs text-primary hover:underline"
        >
          Open workspace →
        </a>
      </header>
      <div className="px-4 py-3">
        {block.error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Search failed: {block.error}
          </p>
        )}
        {!block.error && block.results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No matches in this corpus.
          </p>
        )}
        {!block.error && block.results.length > 0 && (
          <ol className="space-y-2 text-sm">
            {block.results.map((r) => (
              <li key={r.id} className="leading-snug">
                <p className="text-foreground">{r.title}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {[r.context, r.date].filter(Boolean).join(' · ') || ''}
                </p>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            +{more.toLocaleString()} more in the workspace.
          </p>
        )}
      </div>
    </article>
  )
}

/** Short label for chips and the result-count header. */
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
    case 'commentary':
      return 'Commentary'
    case 'presidential':
      return 'Presidential'
    case 'fr':
      return 'Fed. Register'
    case 'congress':
      return 'Congress'
    case 'fbi':
      return 'FBI'
  }
}

/** Longer label for the per-corpus card header. */
function longLabel(slug: CorpusSlug): string {
  switch (slug) {
    case 'litigation':
      return 'Federal litigation'
    case 'usc':
      return 'United States Code'
    case 'cfr':
      return 'Code of Federal Regulations'
    case 'olc':
      return 'OLC opinions'
    case 'frus':
      return 'FRUS'
    case 'lawfare':
    case 'commentary':
      return 'Commentary'
    case 'presidential':
      return 'Presidential Documents'
    case 'fr':
      return 'Federal Register'
    case 'congress':
      return 'Congress'
    case 'fbi':
      return 'FBI Records'
  }
}
