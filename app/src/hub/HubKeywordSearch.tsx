import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toHref } from '@/lib/routing'
import {
  type HubCorpusSlug,
  type HubKeywordResponse,
  runHubKeyword,
  type CorpusSlug,
} from '@lawfare/ragtime-client'
import { spokes } from '@/spokes/registry'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'

/**
 * The hub's search surface — cross-corpus keyword search (PR 4u).
 *
 * Brief #1's free demo moment. Plain-language input → five parallel FTS
 * queries → grouped-by-corpus results. No LLM. The hub's "stand on its
 * own" base layer, per brief #1 §4b — every query already returns the
 * ranked responsive document set even before the (Phase 2) AI synthesis
 * lands.
 *
 * This is now the hub's *only* search affordance, and it presents as plain
 * "Search". It used to be the right-hand half of a segmented Ask / Search
 * toggle; the Ask tab ({@link HubAmaSearch}) was retired because the
 * /explorer route is the "ask across everything" surface now, and because
 * semantic-vs-keyword is a property of the corpus being searched rather
 * than a question to put to the reader before they have typed anything.
 * So the copy below describes what the box does and never contrasts itself
 * with a neighbour that is no longer there. `HubAmaSearch.tsx` is left in
 * the tree, unreferenced, as the revert path.
 *
 * Layout:
 *   - One search input, and nothing beside it. Every query fans out across
 *     all ten keyword corpora. A chip row used to sit under the box — one
 *     toggle per corpus, all on by default per brief #1 §2 — so a reader
 *     could say "just OLC + litigation". It was taken out deliberately,
 *     not because it was broken: ten switches is a decision demanded of
 *     someone who has not typed anything yet, and it bought a narrowing
 *     that the result cards already give for free (each corpus is its own
 *     card, with its own count and its own way into the workspace). A
 *     better narrowing affordance is intended, elsewhere; until it lands
 *     the fan is total and the surface says so by having no control at all.
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

/**
 * The spokes the hub keyword fan searches. Sanctions is registry-listed (it
 * has a corpus card) but EXCLUDED here, mirroring the Worker's HUB_CORPORA:
 * its keyword union includes the same federal_register documents the fr
 * card already surfaces, so fanning both would double-surface every FR
 * sanctions doc under two id schemes (the commentary/lawfare lesson).
 */
const HUB_KEYWORD_SPOKES = spokes.filter((s) => s.slug !== 'sanctions')

/**
 * What every hub query searches: all of them. This was a `useState<Set<…>>`
 * seeded with exactly these slugs, back when the chip row could add and
 * remove them. With the chips gone the set had one reachable value for the
 * life of the component, so it is a constant — the fan-out is a property of
 * the surface now, not a thing the reader is holding. It is still reported
 * in the usage log, because what was searched stays worth knowing even when
 * nobody chose it.
 */
const HUB_KEYWORD_CORPORA: CorpusSlug[] = HUB_KEYWORD_SPOKES.map((s) => s.slug)

export function HubKeywordSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const auth = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<HubKeywordResponse | null>(null)
  // The query that produced `response` — carried into the spoke via `?q=` so
  // "Open workspace →" lands on the responsive set, not the full corpus. Held
  // separately from `query` (the live input) so editing the box post-search
  // doesn't desync the carryover from the displayed results.
  const [submittedQuery, setSubmittedQuery] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    try {
      const r = await runHubKeyword(q, HUB_KEYWORD_CORPORA as HubCorpusSlug[])
      setResponse(r)
      setSubmittedQuery(q)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'hub',
          mode: 'keyword',
          question: q,
          plan: {
            corpora: HUB_KEYWORD_CORPORA,
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

  const canSubmit = !loading && query.trim().length > 0

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
            aria-label="Cross-corpus search"
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

/** Short label for the result-count header. */
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
    case 'sanctions':
      return 'Sanctions'
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
    case 'sanctions':
      return 'Sanctions'
  }
}
