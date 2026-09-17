import { useEffect, useState } from 'react'
import { SurfaceIntro } from '@/components/SurfaceIntro'
import { getHoldingsCached } from '@/lib/holdings-cache'
import { toHref } from '@/lib/routing'
import { spokes } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * Hub landing surface — brief #1 (general AMA hub).
 *
 * The hub is the user's entry point to RAGtime. It surfaces the loaded
 * corpora as ruled rows with their holdings (counts + coverage +
 * last-updated), each one linking into its spoke.
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

/**
 * The hub's opening. Its counterpart is the Explorer's empty state, which makes the same
 * move in the same place on the screen — so both are {@link SurfaceIntro} wearing their
 * own surface's clothes, and the browser can travel one between the two rather than
 * dissolve two into each other.
 */
function HubHero() {
  return (
    <SurfaceIntro
      level={1}
      className="pt-14 pb-2 text-center"
      heading="The Hub: One Search to Rule Them All"
      headingClassName="mx-auto max-w-3xl font-serif text-[2.6rem] font-medium leading-[1.12] tracking-tight text-foreground"
      ledeClassName="mx-auto mt-4 max-w-xl font-serif text-lg italic text-lawfare-text-secondary"
      lede={
        <>
          Statutes, regulations, presidential documents, the Federal Register,
          congressional hearings and debates, executive-branch legal opinions,
          diplomatic history, the federal litigation that interprets them all —
          and Lawfare's analysis of the whole — together.
        </>
      }
    />
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
      {/* This row leads the corpus rows out and leads them back in — see the stagger in
          `src/transitions.css`. It is named and they are named; the `<section>` around
          them is not, because a named ancestor would take the whole list out of the page
          snapshot as one picture and there would be nothing left to stagger. */}
      <div
        className="flex items-baseline justify-between gap-4"
        style={{ viewTransitionName: 'corpora-heading' }}
      >
        <h2 className="font-serif text-xl font-semibold">Corpora</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {spokes.length} loaded
        </span>
      </div>
      {/* One column, not two, and no gap. A ruled list's argument is a regular cadence of
          rules down one measure: two columns of rows whose descriptions wrap to different
          depths give two cadences that agree nowhere, and every mismatch between them
          reads as a broken rule rather than as a separated row. A gap would be the same
          mistake in miniature — the rows have to touch for the rule between them to be
          the thing that separates them. The width the second column used to buy is
          recovered inside each row instead: above `sm`, the holdings and the link sit
          beside the title rather than under it, so a row stays about three lines deep. */}
      <div>
        {/* The index is the row's name for the length of the transition, and nothing
            else: `hub-card-1` through `hub-card-N` in list order, so the choreography can
            hold each one back by one more beat than the last. By position rather than by
            slug because the stagger is about where a row is on the screen, not which
            corpus it happens to be — reorder the registry and the wave still runs top to
            bottom. `transitions.css` writes its rules out to twelve; there are eleven
            spokes today, and a twelfth added here needs a line added there. */}
        {spokes.map((s, i) => (
          <SpokeCard key={s.slug} spoke={s} index={i} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  )
}

function SpokeCard({
  spoke,
  index,
  onNavigate,
}: {
  spoke: CorpusSpoke
  /** Position in the list, which is this row's place in the exit wave. See `SpokeGrid`. */
  index: number
  onNavigate: (path: string) => void
}) {
  const href = `/corpus/${spoke.slug}`
  const realHref = toHref(href)

  return (
    // This was a bordered, rounded, shadowed card; it is now a row on the page's own
    // paper, separated from its neighbours by a hairline rule. A box contains, and says
    // that what is inside it is a thing apart from the page. A rule only separates, and
    // says where one corpus stops and the next begins — which is the whole of what a
    // corpus in a list of corpora needs said about it.
    //
    // The rule is `border-t` on every row rather than `divide-y` on the container, for
    // two reasons. It gives the first row a rule too, so the cadence starts at the top of
    // the list rather than one row late, and the heading above is separated from the list
    // the same way the rows are separated from each other. And it puts the rule on the
    // row itself rather than on a parent's `* + *` selector, so it travels with the row
    // when the exit wave lifts each one out under its own name. Nothing closes the list
    // at the bottom: a rule separates rather than encloses, and there is nothing below
    // the last row for it to be separated from until the about panel brings its own.
    <div
      className="flex flex-col gap-2 border-t border-lawfare-line py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
      style={{ viewTransitionName: `hub-card-${index + 1}` }}
    >
      <div className="min-w-0 space-y-1 sm:flex-1">
        <h3 className="font-serif text-lg font-semibold">{spoke.title}</h3>
        <p className="text-sm text-muted-foreground">{spoke.description}</p>
      </div>
      <div className="space-y-2 sm:max-w-[50%] sm:shrink-0 sm:text-right">
        <HoldingsSummary spoke={spoke} />
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
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  )
}

/**
 * Holdings disclosure rendered inside each row. Counts come from the
 * spoke's `getHoldings()` — for litigation, that's a live Worker call;
 * for the others, hardcoded values from the corpus ingest reports.
 *
 * Failures render as a quiet "—" rather than blocking the row. The hub is
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
    <footer
      className="mt-12 border-t border-lawfare-line pt-6 text-xs text-muted-foreground"
      style={{ viewTransitionName: 'hub-footer' }}
    >
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
    // Named, with the footer below it, so the two things at the bottom of the hub leave
    // after the cards above them rather than with them — the page empties downward.
    <section
      className="mt-12 border-t border-lawfare-line pt-6"
      style={{ viewTransitionName: 'about-panel' }}
    >
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
