import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { toHref } from '@/lib/routing'
import { spokes } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@/spokes/types'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * Hub landing surface — brief #1 (general AMA hub).
 *
 * The hub is the user's entry point to RAGtime. It surfaces the loaded
 * corpora as cards with their holdings (counts + coverage + last-updated),
 * each active card linking into its spoke and each coming-soon card
 * showing the holdings disclosure but no link.
 *
 * The cross-corpus keyword search (brief #1 §3 free tier) sits above the
 * spoke grid: a single plain-language input fires parallel FTS queries
 * across all 6 corpora and surfaces grouped-by-corpus results inline.
 * The paid AI synthesis layer (brief #1 Phase 2) lands later — needs
 * pgvector to provide a single comparable relevance score across tables.
 */
export function Hub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="min-h-screen bg-lawfare-paper text-foreground">
      <HubHeader />
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <HubHero />
        <HubKeywordSearch onNavigate={onNavigate} />
        <SpokeGrid onNavigate={onNavigate} />
        <AboutPanel />
        <HubFooter onNavigate={onNavigate} />
      </div>
    </main>
  )
}

function HubHeader() {
  return (
    <header className="border-b border-lawfare-line bg-lawfare-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-3xl font-semibold tracking-tight text-foreground">
            RAGtime
          </span>
          <span className="hidden font-serif text-[15px] italic text-lawfare-text-secondary sm:inline">
            research across government
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-lawfare-muted sm:inline">
            a project of{' '}
            <span className="font-bold text-lawfare-text-secondary">Lawfare</span>
          </span>
          <DocsTrigger />
          <AccessSettings />
        </div>
      </div>
    </header>
  )
}

/** The six loaded corpora as a quiet credibility strip under the hero.
 * Rounded, impressionistic figures; the exact, sourced counts live on each
 * corpus card below (and inside each spoke's holdings band). */
const HUB_STATS: { num: string; label: string }[] = [
  { num: '1.1M', label: 'court cases' },
  { num: '60k', label: 'U.S. Code §§' },
  { num: '228k', label: 'CFR §§' },
  { num: '2,145', label: 'OLC opinions' },
  { num: '314k', label: 'FRUS documents' },
  { num: '23k', label: 'Lawfare pieces' },
  { num: '12.7k', label: 'presidential documents' },
]

function HubHero() {
  return (
    <section className="pt-14 pb-2 text-center">
      <h1 className="mx-auto max-w-3xl font-serif text-[2.6rem] font-medium leading-[1.12] tracking-tight text-foreground">
        The Hub: One Search to Rule Them All
      </h1>
      <p className="mx-auto mt-4 max-w-xl font-serif text-lg italic text-lawfare-text-secondary">
        Statutes, regulations, executive-branch opinions, diplomatic history,
        the federal litigation that interprets them — and Lawfare's analysis
        of all of it — together.
      </p>
      <dl className="mx-auto mt-8 flex max-w-3xl flex-wrap items-baseline justify-center gap-x-7 gap-y-3">
        {HUB_STATS.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <dt className="font-serif text-2xl font-semibold text-lawfare-teal">
              {s.num}
            </dt>
            <dd className="text-xs text-lawfare-muted">{s.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Cross-corpus keyword AMA placeholder.
 *
 * Brief #1's flagship feature — free keyword AMA that spans all loaded
 * corpora. v1 ships disabled because (a) cross-corpus query routing on the
 * Worker hasn't been designed yet and (b) only one spoke is implemented,
 * so cross-corpus has nothing to cross to. The UI affordance is here so
 * the user understands what's coming.
 */
function SpokeGrid({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="mt-10 space-y-3 border-t border-lawfare-line pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl font-semibold">Corpora</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {spokes.length} loaded
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {spokes.map((s) => (
          <SpokeCard key={s.slug} spoke={s} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  )
}

function SpokeCard({
  spoke,
  onNavigate,
}: {
  spoke: CorpusSpoke
  onNavigate: (path: string) => void
}) {
  const active = spoke.status === 'active'
  const href = `/corpus/${spoke.slug}`
  const realHref = toHref(href)

  return (
    <Card
      className={
        active ? 'transition hover:border-primary/60 hover:shadow-sm' : ''
      }
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold">{spoke.title}</h3>
          <StatusBadge status={spoke.status} />
        </div>
        <p className="text-sm text-muted-foreground">{spoke.description}</p>
        <HoldingsSummary spoke={spoke} />
        {active ? (
          <a
            href={realHref}
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
            className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open <span aria-hidden>→</span>
          </a>
        ) : (
          <a
            href={realHref}
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
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/70"
          >
            Preview details →
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: CorpusSpoke['status'] }) {
  if (status === 'active') {
    return (
      <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        Live
      </span>
    )
  }
  if (status === 'coming-soon') {
    return (
      <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Coming soon
      </span>
    )
  }
  return (
    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      Archived
    </span>
  )
}

/**
 * Holdings disclosure rendered inside each card. Counts come from the
 * spoke's `getHoldings()` — for litigation, that's a live Worker call;
 * for the coming-soon stubs, hardcoded values from the corpus ingest
 * reports.
 *
 * Failures render as a quiet "—" rather than blocking the card. The hub is
 * a navigation surface; a stale or unreachable count shouldn't keep the
 * user from getting into the spoke.
 */
function HoldingsSummary({ spoke }: { spoke: CorpusSpoke }) {
  const [holdings, setHoldings] = useState<CorpusHoldings | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const h = await spoke.getHoldings()
        if (!cancelled) setHoldings(h)
      } catch {
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spoke])

  if (errored) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        (holdings unavailable)
      </p>
    )
  }
  if (!holdings) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        Loading holdings…
      </p>
    )
  }

  // Render the counts inline (e.g. "1,099,912 cases · 6,749,136 entries").
  const countEntries = Object.entries(holdings.counts)
  const countLine = countEntries
    .map(([k, v]) => `${v.toLocaleString()} ${k}`)
    .join(' · ')

  return (
    <dl className="space-y-1 font-mono text-xs text-muted-foreground">
      <div>{countLine}</div>
      <div>{holdings.coverage}</div>
    </dl>
  )
}

function HubFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="mt-12 border-t border-lawfare-line pt-6 text-xs text-muted-foreground">
      <p>
        &copy; The Lawfare Institute &middot;{' '}
        <button
          type="button"
          onClick={() => onNavigate('/privacy')}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </button>
        {' '}&middot;{' '}
        <button
          type="button"
          onClick={() => onNavigate('/terms')}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </button>
      </p>
    </footer>
  )
}

function AboutPanel() {
  return (
    <section className="mt-12 border-t border-lawfare-line pt-6">
      <h2 className="font-serif text-base font-semibold">About RAGtime</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        A Lawfare Institute research surface. Free tier covers structured
        filtering and free keyword search; AI features (analysis, narrative
        synthesis, agentic ask) require either your own provider API key
        (bring-your-own-key) or a paid prepaid balance billed by Lawfare.
        The corpora here are democracy-adjacent public information held in
        a queryable form; corpus loaders are reproducible and open-source.
      </p>
    </section>
  )
}
