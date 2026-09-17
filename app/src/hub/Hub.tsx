import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { getHoldingsCached } from '@/lib/holdings-cache'
import { toHref } from '@/lib/routing'
import { spokes } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * Hub landing surface — brief #1 (general AMA hub).
 *
 * The hub is the user's entry point to RAGtime. It surfaces the loaded
 * corpora as cards with their holdings (counts + coverage + last-updated),
 * each active card linking into its spoke and each coming-soon card
 * showing the holdings disclosure but no link.
 *
 * One search affordance sits above the spoke grid, labelled plainly
 * "Search" ({@link HubKeywordSearch}): a single plain-language input fires
 * parallel FTS queries across all loaded corpora and surfaces
 * grouped-by-corpus results inline.
 *
 * It used to be one half of a segmented Ask / Search toggle, semantic on
 * the left and keyword on the right. Both halves are gone as a choice the
 * reader makes. Whether a query is answered semantically or lexically is a
 * property of the corpus being searched, not a setting anyone arrives here
 * with an opinion about — and the "ask across everything" moment the Ask
 * tab existed for is now the /explorer route, which does it better with a
 * tool loop and a visible cost. `HubAmaSearch.tsx` stays in the tree
 * unreferenced so that call is cheap to reverse.
 *
 * The slot that toggle vacated held a second pill bar for a day — Search
 * beside a link to /explorer — and it is gone too. It was a third thing
 * claiming to be the top of the page, under a masthead that already carried
 * the way to the Explorer. The hub no longer draws a bar at all: the site's
 * one bar is mounted above every route in `App` (`components/SiteBar.tsx`),
 * so this page is its own content and nothing else.
 */
export function Hub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    // `data-tune` marks the hub as a tunable surface: `hub.css` declares the
    // three properties the utilities below read, and the panel treats this
    // attribute being in the DOM as "the hub is what you are looking at".
    <main data-tune="hub" className="min-h-screen bg-lawfare-paper text-foreground">
      <div className="mx-auto max-w-[var(--hub-measure)] px-[var(--hub-gutter)] pb-16">
        <HubHero />
        <HubKeywordSearch onNavigate={onNavigate} />
        <SpokeGrid onNavigate={onNavigate} />
        <AboutPanel />
        <HubFooter onNavigate={onNavigate} />
      </div>
    </main>
  )
}

function HubHero() {
  return (
    <section className="pt-14 pb-2 text-center">
      <h1 className="mx-auto max-w-3xl font-serif text-[2.6rem] font-medium leading-[1.12] tracking-tight text-foreground">
        The Hub: One Search to Rule Them All
      </h1>
      <p className="mx-auto mt-4 max-w-xl font-serif text-lg italic text-lawfare-text-secondary">
        Statutes, regulations, presidential documents, the Federal Register,
        congressional hearings and debates, executive-branch legal opinions,
        diplomatic history, the federal litigation that interprets them all —
        and Lawfare's analysis of the whole — together.
      </p>
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
        const h = await getHoldingsCached(spoke)
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
