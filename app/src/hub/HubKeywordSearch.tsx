import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type HubCorpusSlug,
  type HubKeywordResponse,
  runHubKeyword,
} from '@/lib/worker-client'
import { spokes } from '@/spokes/registry'
import type { CorpusSlug } from '@/spokes/types'

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
  const [query, setQuery] = useState('')
  const [activeCorpora, setActiveCorpora] = useState<Set<CorpusSlug>>(
    () => new Set(spokes.map((s) => s.slug)),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<HubKeywordResponse | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && query.trim().length > 0 && activeCorpora.size > 0

  return (
    <section className="py-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cross-corpus keyword search
            <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
              Free · searches all loaded corpora in parallel · results grouped
              by corpus
            </span>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. executive privilege, recess appointment, HIPAA Privacy Rule, Cuban missile crisis"
            disabled={loading}
            maxLength={200}
            className={cn(
              'mt-1.5 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base shadow-xs',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Search in:
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
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
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
  loading,
  onNavigate,
}: {
  response: HubKeywordResponse
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
  onNavigate,
}: {
  corpus: CorpusSlug
  block: NonNullable<HubKeywordResponse['per_corpus'][CorpusSlug]>
  onNavigate: (path: string) => void
}) {
  const href = `/corpus/${corpus}`
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
          href={href}
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
  }
}
