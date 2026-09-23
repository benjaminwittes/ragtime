import { useEffect, useState } from 'react'
import { formatCount } from '@/lib/format-count'
import { getHoldingsCached, readHoldingsSnapshot } from '@/lib/holdings-cache'
import { toHref } from '@/lib/routing'
import { spokeGroups, spokes } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * Hub landing surface — brief #1 (general AMA hub).
 *
 * The hub is the user's entry point to RAGtime, and it is now two screens.
 *
 * The first is the question: a title naming one corpus at a time, the box, and
 * the two modes it can be sent in ({@link HubKeywordSearch}) — the free keyword
 * fan across the loaded corpora, or the same words handed to the Explorer. It
 * fills the viewport under the site bar, and it says at its own foot that the
 * corpora are below, which is the whole of what the fold costs a reader.
 *
 * The second is the ledger: the corpora in four headed groups, two to a row —
 * each entry a title with its headline count at the end of the same line and one
 * line of copy beneath the two of them, the whole of that being the link into
 * its spoke — then the about panel and the footer.
 *
 * The box used to be one half of a segmented Ask / Search toggle, semantic on
 * the left and keyword on the right, and the two tabs above it now are not that
 * toggle coming back. That one asked whether a *corpus* should be searched
 * semantically or lexically, which is a property of the corpus rather than a
 * setting anyone arrives here with an opinion about. These two ask which surface
 * takes the sentence — the index here, or the Explorer's tool loop with its
 * visible cost — and that changes what happens next rather than how the same
 * thing is done. `HubAmaSearch.tsx` stays in the tree unreferenced; it is not
 * what came back.
 *
 * The hub draws no bar of its own: the site's one bar is mounted above every
 * route in `App` (`components/SiteBar.tsx`), so this page is its own content and
 * nothing else — and that bar's measured height is what the first screen is
 * sized against (`--site-bar-h`).
 */

/**
 * Where the first screen's foot line points. Declared here, beside the section
 * it names, and handed down to the hero — an anchor spelled in two files is an
 * anchor that will one day be right in one of them.
 */
const CORPORA_ID = 'corpora'

export function Hub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    // `data-tune` marks the hub as a tunable surface: `hub.css` declares the
    // three properties the utilities below read, and the panel treats this
    // attribute being in the DOM as "the hub is what you are looking at".
    <main data-tune="hub" className="min-h-screen bg-lawfare-paper text-foreground">
      <div className="mx-auto max-w-[var(--hub-measure)] px-[var(--hub-gutter)] pb-16">
        <HubKeywordSearch onNavigate={onNavigate} corporaId={CORPORA_ID} />
        <SpokeGrid onNavigate={onNavigate} />
        <AboutPanel />
        <HubFooter onNavigate={onNavigate} />
      </div>
    </main>
  )
}

/**
 * The corpora, grouped and headed, as the body of the hub.
 *
 * Eleven corpora in one undifferentiated list asked the reader to hold
 * eleven things and told them nothing about how the eleven relate. The four
 * groups are the relation — the law, how it has been read, the record of
 * what was done, and the commentary that is not a primary source at all —
 * and `spokes/registry.ts` argues for the membership. Here they are only
 * rendered: a heading in the page's own reading voice, then that group's
 * entries.
 */
function SpokeGrid({ onNavigate }: { onNavigate: (path: string) => void }) {
  // One counter over headings and entries in DOM order, resolved once here rather
  // than arrived at inside the loops. The exit wave numbers the page as the reader
  // reads it, and a heading is as much a thing on the screen as the entries under
  // it, so it takes a number too. See the note on `SpokeCard`'s `index`.
  let cursor = 0
  const groups = spokeGroups.map((group) => ({
    heading: group.heading,
    headingIndex: cursor++,
    entries: group.spokes.map((spoke) => ({ spoke, index: cursor++ })),
  }))

  return (
    // The id is what the first screen's foot line scrolls to. `scroll-mt-6` is
    // air above the rule when it lands: the site bar is not sticky, so nothing
    // has to be cleared — but a section whose own hairline is flush with the top
    // of the window reads as a page cut off rather than a page arrived at.
    <section
      id={CORPORA_ID}
      className="mt-10 scroll-mt-6 border-t border-lawfare-line pt-8"
    >
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
      {groups.map((group, g) => (
        <div key={group.heading} className={g === 0 ? 'mt-5' : 'mt-6'}>
          {/* The heading sits on the paper, above the first rule of its group rather
              than inside a ruled cell, so it reads as a label for what follows and not
              as another entry. It is in the serif because it names the group — "The law",
              "As read" — in the same reading voice as everything it heads, and a mono
              uppercase eyebrow said it in the voice of a spec sheet instead, which is the
              one voice this page has no use for. The teal is lawfaremedia.org's own accent
              gesture: one colour on the bottom edge, 2px, the width of the words and not
              of the measure — so it marks the heading rather than ruling the page, and
              four groups get one accent rather than four. `mb-3` under it keeps that rule
              clear of the group's first hairline; nearer, and the two read as one double
              rule. */}
          <h3
            className="mb-3 inline-block border-b-2 border-lawfare-teal pb-1 font-serif text-[17px] font-semibold text-foreground"
            style={{ viewTransitionName: `hub-card-${group.headingIndex + 1}` }}
          >
            {group.heading}
          </h3>
          {/* Two columns above `sm`, and no column gap: the left cell pads right, the
              right cell pads left, so the two cells of a grid row put their rules end to
              end and the page reads one rule across its whole measure. The objection this
              used to carry — that two columns of rows wrapping to different depths give
              two cadences that agree nowhere — was an objection to the old row, which was
              a title, a description, two mono lines and a link. An entry is now two
              lines — a title with its count, then one line of copy — so wherever both
              of those fit their line, which is nearly everywhere, the two columns are
              the same height without anything being done about it; and where a long
              title or a long description takes a second line, CSS grid gives a row's
              cells one height, which puts the next pair of rules back on the same line
              like a ruled ledger. A group with an odd count leaves its last cell in
              the left column at half width. That is the honest thing to show — the rule
              stops where the content stops — and spanning it would make one entry look
              like a different kind of entry. */}
          <div className="grid sm:grid-cols-2">
            {group.entries.map(({ spoke, index }, i) => (
              <SpokeCard
                key={spoke.slug}
                spoke={spoke}
                index={index}
                side={i % 2 === 0 ? 'left' : 'right'}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function SpokeCard({
  spoke,
  index,
  side,
  onNavigate,
}: {
  spoke: CorpusSpoke
  /**
   * The entry's place in the exit wave, counted over headings and entries alike in
   * DOM order (see `SpokeGrid`). It is the name for the length of a transition and
   * nothing else, and it is a position rather than a slug because the choreography
   * is about where a thing is on the screen, not which corpus it happens to be —
   * regroup the registry and the wave still runs top to bottom. `transitions.css`
   * writes its rules out to sixteen; four headings and eleven corpora make fifteen
   * today, and the sixteenth thing added here needs a line added there.
   */
  index: number
  /** Which column the entry falls in, which decides the side it pads. */
  side: 'left' | 'right'
  onNavigate: (path: string) => void
}) {
  const href = `/corpus/${spoke.slug}`
  const realHref = toHref(href)

  return (
    // This was a bordered, rounded, shadowed card; it is now an entry on the page's own
    // paper, separated from its neighbours by a hairline rule. A box contains, and says
    // that what is inside it is a thing apart from the page. A rule only separates, and
    // says where one corpus stops and the next begins — which is the whole of what a
    // corpus in a list of corpora needs said about it.
    //
    // The control is the whole description, not the title on its own. A reader deciding
    // whether to open a corpus is reading the title, the count and the line of copy as
    // one thing, so that is the thing that should answer to the pointer; a link the width
    // of two or three words asked them to aim at a fraction of what they were reading.
    // The box that says so appears only on hover, focus or press — a wash of the brand's
    // teal tint (`lawfare-teal-bg`, the colour the focus ring already wears at full
    // strength), no border and no shadow, so the page at rest is still ruled rather than
    // boxed and a four-sided edge still means exactly one thing here: a control you are
    // addressing. A shade of the paper was tried first and rejected on the live page: at
    // the breadth of a whole entry it read as a sickly yellow rather than as paper.
    // The title stays ink for the same reason it always did — eleven teal titles down a
    // page would read as eleven controls sitting in a page of controls — and its hover
    // underline is gone, because the wash now says what the underline was saying.
    //
    // The rule lives on the outer cell and the wash on the inner link, and the two cannot
    // swap. The rule is a separator: it marks where this entry stops and the next begins,
    // so it must stay exactly as wide as the column and line up end to end with its
    // neighbour's across a grid row. The wash is a state: it has to cover the thing you
    // are pointing at, which means bleeding a little past the text on both sides — hence
    // `-mx-3 px-3` on the link, 12px out and 12px back, so the highlight is generous while
    // the words stay on the same left edge as the rule above them. At the page's outer
    // edge that 12px runs into the 24px gutter and at the column seam into `sm:pr-8` /
    // `sm:pl-8`, so it has room on both sides and nothing overflows. The vertical `py-3`
    // moves onto the link with it: padding the cell instead would leave a band above and
    // below that looks like the control and does not answer.
    //
    // The rule is `border-t` on every entry rather than `divide-y` on the container, for
    // two reasons. It gives the first entry a rule too, so the cadence starts at the top
    // of a group rather than one entry late, and the heading above is separated from its
    // group the same way the entries are separated from each other. And it puts the rule
    // on the entry itself rather than on a parent's `* + *` selector, so it travels with
    // the entry when the exit wave lifts each one out under its own name. Nothing closes
    // a group at the bottom: a rule separates rather than encloses, and the next heading
    // or the about panel brings its own. The view-transition name stays here too, on the
    // cell: the wave numbers the entries as the reader reads them, and the thing that
    // leaves the page is the entry, not the link inside it.
    <div
      className={`border-t border-lawfare-line ${
        side === 'left' ? 'sm:pr-8' : 'sm:pl-8'
      }`}
      style={{ viewTransitionName: `hub-card-${index + 1}` }}
    >
      {/* A block link around a heading and a paragraph is valid HTML, and its accessible
          name is the whole of the entry's text — the title, the count and the copy read
          out in order, which is what a reader choosing between corpora wants to hear. It
          is also why this is a real element rather than a stretched pseudo-element over
          the cell: keyboard focus encloses the box the pointer highlights, so both kinds
          of reader are told the same thing about the same shape. */}
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
        className="block -mx-3 space-y-1 rounded-[var(--radius)] px-3 py-3 transition-colors duration-150 hover:bg-lawfare-teal-bg focus-visible:bg-lawfare-teal-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawfare-teal active:bg-lawfare-teal-bg"
      >
        {/* The title and its count share the entry's first line, the name at the left and
            the figure at the right, so an entry is read the way a line of a ledger is read
            and the copy sits under both of them. The two are aligned on the baseline rather
            than on their boxes, which is what puts the first line of a title that wraps on
            the same baseline as the figure instead of centring the pair against each other.
            A long title wraps inside its own half of the line because the heading is allowed
            to be narrower than its text (`min-w-0`) and the figure is not allowed to be
            narrower than its own (`shrink-0`) — so the figure keeps its place at the right
            edge and the title takes the second line it needs. */}
        <div className="flex items-baseline justify-between gap-4">
          <h4 className="min-w-0 font-serif text-lg font-semibold text-foreground">
            {spoke.title}
          </h4>
          <HoldingsSummary spoke={spoke} />
        </div>
        <p className="text-sm text-lawfare-text-warm">{spoke.description}</p>
      </a>
    </div>
  )
}

/**
 * The one number an entry carries: the headline count from the spoke's
 * `getHoldings()` — for litigation a live Worker call, for the others values
 * the corpus ingest reports settled — taken as the first entry of `counts`,
 * rounded, and nothing more.
 *
 * Rounded because on the hub the figure's job is scale rather than audit:
 * "1.7M cases" is the whole of what this line has to say, and the exact count
 * lives on the spoke's own provenance disclosure, beside the coverage window
 * that qualifies it. `lib/format-count.ts` carries the rest of that argument,
 * and the form says approximate by itself — no tilde, no "about".
 *
 * The figure also arrives without waiting, on any visit but the first. Holdings
 * are stored per corpus (`lib/holdings-cache.ts`) and the state is initialised
 * from that snapshot, so a return visit paints the count in the first render;
 * the effect below still fetches, and because the figure is rounded, a refresh
 * that moved the count by a few hundred re-renders the same string and nothing
 * on the line moves. The first-ever visit has nothing stored and shows the
 * ellipsis, as it always did.
 *
 * It is rendered inline, at the right of the title's line rather than under it,
 * so the name and the figure are read together. That placement is what decides
 * the shape of the two placeholders: each one stands in a line that is already
 * drawn, so neither may be taller or much wider than the figure it replaces, or
 * the first line of every entry would be set at one width and then move as the
 * counts land. The wait is a single mono ellipsis, and the failure is two short
 * words.
 *
 * The hub used to show the coverage line under it as well, and that was the
 * hub restating a fact it does not own. Coverage is a claim about what is and
 * is not in a corpus, it is qualified, and the qualifications live on the
 * spoke's own provenance disclosure where there is room for them. Two of the
 * old hub descriptions had quietly drifted from what that disclosure says, and
 * a page that says a thing twice will eventually say it two ways. So the hub
 * says how much, and the spoke says of what.
 *
 * Failures stay quiet rather than blocking the entry. The hub is a navigation
 * surface; a stale or unreachable count should not keep anyone out of a spoke.
 * Quiet is not silent, though: "count unavailable" says that a number was meant
 * to be here and is missing, where an empty right edge would say that this
 * corpus never had one. And a failed fetch with a snapshot behind it shows the
 * snapshot — a count from the last visit is worth more to a reader than a
 * confession that this one did not load, and it is the same figure to within
 * the rounding.
 */
function HoldingsSummary({ spoke }: { spoke: CorpusSpoke }) {
  // Read once, at mount, and synchronously: a value in the initial state is a
  // value in the first paint. Passing the function rather than the call keeps
  // storage out of every later render.
  const [holdings, setHoldings] = useState<CorpusHoldings | null>(() =>
    readHoldingsSnapshot(spoke),
  )
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

  // A figure beats both placeholders, whichever way it arrived — fetched this
  // visit, or read from storage and left standing by a fetch that failed.
  if (holdings) {
    // The first entry of `counts` is the headline one by the descriptor's own ordering
    // — "1.7M cases" before the docket entries under them, "60K sections" before the
    // titles they sit in. The rest are a breakdown, and a breakdown belongs where
    // there is room to explain it.
    const headline = Object.entries(holdings.counts)[0]
    if (!headline) return null
    const [label, value] = headline
    return (
      <span className="shrink-0 font-mono text-xs text-right text-lawfare-text-warm">
        {formatCount(value)} {label}
      </span>
    )
  }

  if (errored) {
    return (
      <span className="shrink-0 font-mono text-xs text-right text-lawfare-text-warm">
        count unavailable
      </span>
    )
  }
  return (
    <span className="shrink-0 font-mono text-xs text-right text-lawfare-text-warm">
      …
    </span>
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
