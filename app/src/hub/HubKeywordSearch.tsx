import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { AskBox } from '@/components/AskBox'
import { SurfaceIntro } from '@/components/SurfaceIntro'
import { useDocs } from '@/docs/DocsContext'
import { cn } from '@/lib/utils'
import { navigateTo, toHref } from '@/lib/routing'
import {
  type HubCorpusSlug,
  type HubKeywordResponse,
  runHubKeyword,
  type CorpusSlug,
} from '@lawfare/ragtime-client'
import { spokeGroups, spokes } from '@/spokes/registry'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { TICKS, type SampleSet } from './samples'
import { useTick } from './tune'

gsap.registerPlugin(useGSAP)

/**
 * The hub's first screen: one box, two modes, and a question already in it.
 *
 * The file is still named for the half that runs here — the free cross-corpus
 * keyword fan (brief #1 §4b): plain-language input → parallel FTS across every
 * loaded corpus but sanctions → grouped-by-corpus results, no LLM, no cost. The
 * other half of the box is a handoff: the same words, sent to `/explorer`, where
 * a conversation orients before it spends. Which one a submit does is the
 * reader's choice, made in two tabs above the field and defaulted to Search.
 *
 * That is not the old Ask / Search toggle come back. The toggle asked whether a
 * *corpus* should be searched semantically or lexically, which is a property of
 * the corpus and not a question to put to anyone before they have typed. This
 * asks which of two surfaces should take the sentence — a free index lookup
 * here, or a research conversation there — and that difference is real, visible
 * in the helper line under the box, and the reason the mode is not remembered
 * between visits: the Explorer needs a credential, and a remembered default
 * landing on a sign-in placeholder would be a page that starts by refusing.
 *
 * The page's examples are in the box rather than beside it. A row of example
 * links under the field was a second set of controls asking to be pressed; the
 * placeholder cycles the same material (`samples.ts`), in step with the corpus
 * the title names, and Tab takes the one on screen. Rotation runs only while the
 * box is empty, so nothing moves under a reader who is typing.
 *
 * Layout:
 *   - The hero fills the viewport under the site bar until a search has run, so
 *     the first screen is the question and the corpora are a deliberate scroll
 *     away (the foot line says so, and how far). Results collapse it: an answer
 *     that arrived below the fold is an answer nobody sees.
 *   - On submit in Search mode: per-corpus result sections, each with top-5 +
 *     total count + "Open workspace →".
 *   - Per-corpus error state: if one corpus's query failed, that section shows
 *     the error; the other corpora still render their results.
 *
 * Not yet here (deferred):
 *   - Click-through from a result item directly to the spoke detail sheet.
 *   - The paid AI synthesis layer (brief #1 Phase 2; needs pgvector).
 */

/**
 * The spokes the hub keyword fan searches. Sanctions is registry-listed (it
 * has a row in the corpus list) but EXCLUDED here, mirroring the Worker's
 * HUB_CORPORA: its keyword union includes the same federal_register documents
 * the fr section already surfaces, so fanning both would double-surface every
 * FR sanctions doc under two id schemes (the commentary/lawfare lesson).
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

/** Which surface takes the sentence. Not persisted — see the note at the top. */
type Mode = 'search' | 'explorer'

/* The two names, each with the one thing its sentence cannot say.
 *
 * The h1 carries what the box takes and what comes back; these strings carry
 * what it costs, which is the half a reader needs precisely when both modes are
 * available to them — an unlit Explorer is its own explanation, a lit one is a
 * choice with a price. Three words each, in the muted mono the Tab hint uses, so
 * a price reads as annotation on the choice rather than a second line of copy.
 *
 * They no longer stand under the words. A caption apiece at rest made the row
 * read as four things when it is two, which is the distraction he called off the
 * live page (2026-09-18, his ruling). Each string waits in the margin of its own
 * tab now and comes back while that tab is under a pointer or a focus ring — see
 * the tablist below for how, and for why nothing moves when one arrives. */
const MODES: readonly { id: Mode; label: string; cost: string }[] = [
  { id: 'search', label: 'Search', cost: 'free, no AI' },
  { id: 'explorer', label: 'Explorer', cost: 'uses AI' },
]

/* The hub's motion, in seconds, because GSAP counts in seconds.
 *
 * The dwell — how long a finished sample stands there before it goes — is not
 * here: it is the `hub.tick` knob, because it is the one number anybody would
 * want to argue about while looking at the page. These four are the craft around
 * it and would only ever be tuned by someone reading this file. */
/** The title leaving, and the next one arriving. */
const FADE = 0.2
/** The finished sample going, all at once — see {@link useAutotype} for why not backwards. */
const CLEAR = 0.18
/** Half a blink. */
const BLINK = 0.55
/** Pixels kept clear at the right of the slide, so the caret is never flush with the clip. */
const CARET_ROOM = 2

export function HubKeywordSearch({
  onNavigate,
  corporaId,
}: {
  onNavigate: (path: string) => void
  /** The id of the corpus section below, which the foot line scrolls to. Owned by `Hub`. */
  corporaId: string
}) {
  const auth = useAuth()
  const docs = useDocs()
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<HubKeywordResponse | null>(null)
  // The query that produced `response` — carried into the spoke via `?q=` so
  // "Open workspace →" lands on the responsive set, not the full corpus. Held
  // separately from `query` (the live input) so editing the box post-search
  // doesn't desync the carryover from the displayed results.
  const [submittedQuery, setSubmittedQuery] = useState('')
  const field = useRef<HTMLInputElement>(null)
  // Typing stops the clock, and clearing the box starts it again on the sample it
  // stopped on. Focus alone does not: a focused empty box still types, which is
  // precisely the state in which Tab means something.
  const rotating = query === ''
  const [at, setAt] = useState(0)
  const tick = TICKS[at]!
  const sample = mode === 'search' ? tick.sample.query : tick.sample.question
  const hero = useRef<HTMLElement>(null)
  const skin = useRef<HTMLDivElement>(null)
  const reel = useRef<HTMLSpanElement>(null)
  const typed = useRef<HTMLSpanElement>(null)
  const caret = useRef<HTMLSpanElement>(null)
  useAutotype({ at, setAt, tick, sample, rotating, hero, skin, reel, typed, caret })

  // The form, the `preventDefault`, and the refusal to search for nothing are AskBox's
  // now — the same three the Explorer's composer had written separately — so what is left
  // here is the fan-out itself and what it does with an answer.
  async function runSearch() {
    const q = query.trim()
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

  /**
   * Submit, whichever mode is on.
   *
   * The Explorer arm names `navigateTo` rather than the `onNavigate` prop the
   * result links use, and they are the same function (App hands this page
   * `navigateTo` itself). The difference is what is being carried: a link goes
   * to a path, and this goes to a path *with a question on it* — a grammar
   * `lib/routing.ts` owns at both ends, since `readCarryoverQuery` is what reads
   * it back on the other side.
   */
  function submit() {
    if (mode === 'explorer') {
      navigateTo('/explorer?q=' + encodeURIComponent(query.trim()))
      return
    }
    void runSearch()
  }

  /**
   * Tab, in an empty box, takes the question on screen.
   *
   * Only while it is empty: the moment there is text, Tab is the browser's again
   * and moves focus, which is what the second press does. Shift+Tab is never
   * intercepted — going backwards out of a field is not a request for a sample.
   */
  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
    if (query !== '') return
    e.preventDefault()
    setQuery(sample)
    // The caret belongs at the end, where it would be if the reader had typed
    // it. React has already written the value by the time a frame is asked for.
    requestAnimationFrame(() => field.current?.setSelectionRange(sample.length, sample.length))
  }

  const canSubmit = !loading && query.trim().length > 0
  // Anything below the box — results or a failure — ends the hero's claim on the
  // viewport. A tall hero with the answer under it is an answer nobody scrolls to.
  const answered = response !== null || error !== null

  return (
    // The first screen, measured against the bar above it: `--site-bar-h` is
    // written by `SiteBar` from its own box (see the note there), because that
    // row wraps at some widths and an approximation would be wrong exactly when
    // it is tallest. The centred block takes the slack and the foot line sits
    // under it, which puts the title a little above the true middle — where a
    // first screen wants it.
    <section
      ref={hero}
      className={cn(
        'flex flex-col',
        !answered && 'min-h-[calc(100dvh-var(--site-bar-h))]',
      )}
    >
      <div className={cn('flex flex-col justify-center py-8', !answered && 'flex-1')}>
        <SurfaceIntro
          level={1}
          className="text-center"
          // One whole sentence per corpus, and the h1 holds nothing but the
          // sentence: no span, no live region, no second heading, no button.
          // What crosses between two corpora is the whole line's opacity, which
          // is also what lets it re-centre and re-wrap while nobody can see it.
          // The mode's own sentence, not one sentence for both: the verb is the
          // big half of the Search/Explorer signal, so the h1 changes when the
          // choice does. Same object either way, so the line neither re-measures
          // nor moves the page under the reader.
          heading={tick.set.titles[mode]}
          // 3.25rem from `sm`, where the longest of the twenty-four sentences is
          // 889px against 976px of measure and every one of them holds a single
          // line; 2.2rem below it, which is the size at which none of them takes
          // a third line at 390. At 2.4 three of them did, and a title that is
          // two lines for one corpus and three for the next moves the whole page
          // under the reader every ninth second. Both numbers were measured in
          // the real face rather than reasoned about — twelve when the rotation
          // was written, twenty-four once each corpus got a second sentence for
          // Search mode, and the widest is still the same litigation "Ask" line,
          // so the cap did not move.
          headingClassName="mx-auto max-w-5xl font-serif text-[2.2rem] font-medium leading-[1.12] tracking-tight text-balance text-foreground sm:text-[3.25rem]"
          ledeClassName="mx-auto mt-4 max-w-xl font-serif text-lg italic text-lawfare-text-secondary"
          lede={
            <>
              The law, how it has been read, what government did with it, and the
              commentary on all three.
            </>
          }
        />

        {/* Two words in the page's reading voice, at about half the height of
            the sentence above them — the page's second voice, not a second
            headline. The active one wears the same accent the group headings
            below do: 2px of teal on the bottom edge, the width of the word,
            which is why the rule sits on a span around the label rather than on
            the button. The inactive one carries a transparent border of the
            same weight so the pair sits on one baseline and nothing moves when
            the choice changes.

            The price used to be a caption under each word. At rest that put two
            mono lines under two serif ones, and the row read as four things
            when it is two. It comes back on the outer flank instead — Search's
            price to the left of Search, Explorer's to the right of Explorer —
            for as long as that tab is under a pointer or a focus ring: a note
            in the margin of the choice, on the choice's own side, and only
            while it is being asked for.

            Nothing moves when one arrives, because a price is never in the flow
            to begin with: each is absolutely positioned inside its own button,
            so revealing it shifts neither tab, nor the box under them, nor the
            page. That is the property the transparent border buys above, bought
            the same way.

            Never the teal: teal is the accent that says *chosen*, and a price is
            not a choice. It stays the muted mono the Tab hint uses, on the lit
            tab as much as the unlit one.

            Below `sm` the reveal never fires. A touch screen has no pointer to
            fire it with, and at 390 a note flanking the pair is a note running
            into the words or off the edge of the paper — so nothing is lost
            there that was not already lost. The span itself is in the document
            at every width, transparent rather than hidden, because the button
            names it in `aria-describedby`, and a price that is `display: none`
            is a price nobody is told. */}
        <div
          role="tablist"
          aria-label="What the box does"
          className="mt-8 flex items-baseline justify-center gap-8 sm:gap-10"
        >
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              id={`hub-mode-${m.id}`}
              aria-selected={mode === m.id}
              aria-controls="hub-ask"
              // The word is the name; the price is a description. Without the
              // label the flanking span would be read into the name — a tab
              // called "Search free, no AI" — and then read out a second time as
              // its own description. With it, the name is the word on screen and
              // the price arrives where a description belongs. Saying it at all
              // is the point: one of these two modes spends money, and an
              // affordance that exists only under a pointer exists neither for a
              // reader who has none nor for a finger on glass.
              aria-label={m.label}
              aria-describedby={`hub-mode-${m.id}-cost`}
              // Roving tabindex, the tablist pattern: one stop for the pair, and
              // the arrows move between them, so Tab from the title lands on the
              // choice once and then on the box.
              tabIndex={mode === m.id ? 0 : -1}
              onClick={() => setMode(m.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                const next = MODES.find((other) => other.id !== m.id)
                if (!next) return
                setMode(next.id)
                document.getElementById(`hub-mode-${next.id}`)?.focus()
              }}
              className={cn(
                'group relative flex flex-col items-center font-serif text-[22px] transition-colors duration-150 sm:text-[28px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawfare-teal',
                mode === m.id
                  ? 'text-foreground'
                  : 'text-lawfare-text-secondary hover:text-lawfare-teal',
              )}
            >
              {/* `pb-2` where the 16px word had `pb-1`: the rule is 2px of ink
                  read against a 28px face, and 4px of air put it in the
                  descender of "Explorer" rather than under the word. */}
              <span
                className={cn(
                  'border-b-2 pb-2 transition-colors duration-150',
                  mode === m.id ? 'border-lawfare-teal' : 'border-transparent',
                )}
              >
                {m.label}
              </span>
              {/* The first tab's price flanks left and the last one's flanks
                  right, so each sits on the pair's outside and neither can
                  collide with the other word. `inset-y-0` with `items-center`
                  rather than a nudged offset: the note is centred on the button
                  it belongs to, which lands an 11px line on the middle of a 28px
                  one without a measured number to go stale. `pointer-events-none`
                  because an invisible price is otherwise still a hit target — a
                  strip of empty paper beside the tabs that changes the mode when
                  clicked. */}
              <span
                id={`hub-mode-${m.id}-cost`}
                className={cn(
                  'pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap font-mono text-[11px] text-lawfare-muted',
                  'opacity-0 transition-opacity duration-150',
                  'sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100',
                  i === 0 ? 'right-full mr-3' : 'left-full ml-3',
                )}
              >
                {m.cost}
              </span>
            </button>
          ))}
        </div>

        {/* `group` here is what lets the Tab hint appear on focus without either
            end knowing about the other: the box is a shared component that ships
            no focus state, and the hint is a sibling of the form rather than
            anything inside it. */}
        <div
          id="hub-ask"
          role="tabpanel"
          aria-labelledby={`hub-mode-${mode}`}
          className="group mt-5"
        >
          {/* The same component the Explorer's composer is, wearing this surface's clothes.
              Five of the measurements below are `var(--ask-*)` rather than literals — the
              radius, the border, the two paddings and the size of the type — because the
              composer decides all five too, and a value decided twice is a value that can
              only be interpolated by accident. Declared with these values at `:root` in
              `index.css` and overridden with the composer's inside `.explorer`.

              `leading-7` is not new: `text-xl` set a font size *and* a line height, and an
              arbitrary font size sets only the first, so the 1.75rem the box was already
              drawn at is said out loud here rather than lost with the utility. `pr-14` stays
              a literal — it is room for the submit control that sits on top of the field,
              which is this skin's arrangement and not a decision the composer also makes. */}
          <div className="relative mx-auto max-w-3xl">
            <AskBox
              as="input"
              inputType="search"
              fieldWrapClassName="relative"
              fieldRef={field}
              value={query}
              onChange={setQuery}
              onSubmit={submit}
              onFieldKeyDown={onFieldKeyDown}
              // The field's own placeholder is empty and the sample is drawn over
              // it instead, by the overlay below: a native placeholder is a string
              // with no inside, so it can be swapped but never typed, and there is
              // nowhere in it to stand a caret. The accessible name is the
              // `aria-label` either way, which is why nothing was lost by taking
              // the placeholder away.
              placeholder=""
              disabled={loading}
              maxLength={200}
              ariaLabel={mode === 'search' ? 'Cross-corpus search' : 'Ask the Explorer'}
              fieldClassName={cn(
                'block w-full rounded-[var(--ask-radius)] border-[length:var(--ask-border-width)] border-primary bg-card py-[var(--ask-pad-y)] pl-[var(--ask-pad-x)] pr-14 font-serif text-[length:var(--ask-font-size)] leading-7 text-foreground shadow-sm',
                'placeholder:text-lawfare-muted focus:outline-none focus:ring-2 focus:ring-primary/30',
                loading && 'cursor-not-allowed opacity-60',
              )}
              submitAriaLabel={mode === 'search' ? 'Search' : 'Ask the Explorer'}
              submitClassName={cn(
                'absolute right-2 top-2 bottom-2 flex w-11 items-center justify-center rounded-md bg-primary text-lg text-primary-foreground transition',
                canSubmit ? 'hover:opacity-90' : 'cursor-not-allowed opacity-40',
              )}
              submitLabel={loading ? '…' : '→'}
            />
            {/* The sample, standing exactly where the placeholder would. It is
                laid over the field rather than inside it, and every measurement
                that puts it on the same line as the reader's own typing is read
                from the same `--ask-*` properties the field reads: the left
                padding, the size, and a transparent border of the field's own
                width, which accounts for the 1.5px the field's border pushes
                its text in by. The reel inside is what slides left, so the
                caret stays in sight while a long question types itself.

                Its right edge is `right-14` and not `pr-14`, which is the
                difference between working and not: `overflow-hidden` clips at
                the *padding* box, so a right padding is room the text is still
                drawn in. Measured at 390, where a long question typed straight
                under the submit control. Ending the box short of the control
                puts the clip where a reader sees it happen.

                `aria-hidden`, because it is a picture of a suggestion: the box
                is named by its `aria-label`, and a screen reader being read a
                sample one character at a time would be the worst seat in the
                house. */}
            {rotating && (
              <div
                ref={skin}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 right-14 flex items-center overflow-hidden border-[length:var(--ask-border-width)] border-transparent pl-[var(--ask-pad-x)] font-serif text-[length:var(--ask-font-size)] leading-7 text-lawfare-muted"
              >
                <span ref={reel} className="inline-flex shrink-0 items-center whitespace-pre">
                  <span ref={typed} />
                  {/* A hairline, the height of the type it follows. `w-px` rather
                      than a character: a block caret at 20px serif reads as a
                      typo. */}
                  <span
                    ref={caret}
                    className="ml-[2px] inline-block h-[1.05em] w-px shrink-0 bg-lawfare-muted"
                  />
                </span>
              </div>
            )}
          </div>

          {/* Its line is reserved rather than overlaid: the field's right padding
              is already spoken for by the submit control, and a hint that
              appeared *into* the layout would move the helper sentence and the
              foot line every time the box took focus. So the row is always
              there and only its ink changes. */}
          <p
            className={cn(
              'mx-auto mt-2 max-w-3xl px-1 font-mono text-[11px] text-lawfare-muted transition-opacity duration-150',
              query === '' ? 'opacity-0 group-focus-within:opacity-100' : 'opacity-0',
            )}
          >
            Tab to use this question
          </p>

          {/* The way in for a reader who wants the longer version, and nothing
              else. What the mode *does* used to be spelled out here in a
              sentence per mode, under the box — which is to say after the
              reader had already chosen, in the smallest voice on the page, in
              the one place they had no reason to look. That job moved up to the
              title and the tabs (2026-09-17, his ruling; the price left the tab
              for the tab's margin the day after). What is left is the link,
              which was never the explanation: plain text, because a link is the
              one thing on this page that may be teal, and a box around it would
              make it a third control under two tabs and a field. */}
          {/* Centred, unlike the Tab hint above it, and the split is on what the
              two refer to: the hint describes the words in the field, so it sits
              where those words start, and the link is a page-level way out, so
              it sits under the middle like everything else in the hero. A lone
              twelve-character link at the far left read as stranded once the
              sentence that used to fill that line was gone. */}
          <p className="mx-auto mt-1 max-w-3xl px-1 text-center text-sm">
            <button
              type="button"
              onClick={() => docs.open('getting-started')}
              className="text-primary underline-offset-2 hover:underline"
            >
              Start here →
            </button>
          </p>
        </div>
      </div>

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

      {/* The foot of the first screen, and the only thing on it that admits
          there is a second one. The two numbers are counted from the registry
          rather than written down here, because a page that says "eleven" in
          prose is a page that will one day say it while showing twelve. It goes
          when the hero collapses: by then the thing below the box is the answer,
          and pointing past it would be pointing away from it. */}
      {!answered && (
        <div className="pb-8 text-center">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(corporaId)
              if (!el) return
              el.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
                block: 'start',
              })
            }}
            className="text-sm text-lawfare-text-warm transition-colors duration-150 hover:text-lawfare-teal"
          >
            {sentenceCase(numberWord(spokes.length))} corpora in{' '}
            {numberWord(spokeGroups.length)} groups ↓
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * The sample typing itself into the box, and the title keeping step with it.
 *
 * One controller for both, because they are one statement: the sentence says
 * which corpus is being addressed and the box shows something to ask *it*, and
 * two clocks would eventually type a FRUS question under a title naming the CFR.
 * A corpus holds the title while its three samples each type and stand
 * (`TICKS`), so the title changes every third beat and the box on every one.
 *
 * The shape of one beat, as a GSAP timeline: the title arrives if this beat
 * opens a new corpus; the sample types a character at a time; it stands for the
 * dwell (`hub.tick`, the one number worth arguing about, so the one that is a
 * knob); it goes; and the title leaves if the next beat belongs to someone else.
 * `onComplete` advances the index, React renders the next sentence behind an
 * already-faded heading, and the next run of this effect fades it back in — so
 * the cross-fade spans two timelines and the geometry changes while nothing is
 * visible, which is the whole reason the title fades rather than slides.
 *
 * **Why a library at all.** Typing is a sequence of forty small waits, and every
 * one of them is a `setTimeout` that has to be cancelled when the reader types
 * one character of their own. GSAP's timeline is that sequence as one object,
 * and `useGSAP` reverts it — every tween, every inline style it set — on unmount
 * and on every dependency change, including React's StrictMode double-mount.
 *
 * **Typed forward, cleared all at once.** A backspace animation on a
 * 130-character question is thirteen seconds of nothing happening; and unlike
 * typing, nobody ever watches a sentence delete itself one character at a time
 * with interest. So the finished sample fades out in under a fifth of a second
 * and the next one starts from nothing.
 *
 * **`gsap.matchMedia` rather than a media query read once.** Under
 * `prefers-reduced-motion: reduce` there is no rotation at all — not a slower
 * one. That is the reading `transitions.css` gives the same setting: a page that
 * rearranges itself while you look at it is the thing being asked about. Such a
 * reader gets the first beat standing still — the whole federal record, and the
 * first of the three questions the Explorer itself offers — with no caret, since
 * a caret is a promise that something is about to happen.
 *
 * `rotating` is the box being empty. Stopping is just not scheduling; the index
 * stays where it is, so clearing the box picks the same sample up from the top.
 */
function useAutotype({
  at,
  setAt,
  tick,
  sample,
  rotating,
  hero,
  skin,
  reel,
  typed,
  caret,
}: {
  at: number
  setAt: (next: (previous: number) => number) => void
  tick: { set: SampleSet }
  sample: string
  rotating: boolean
  hero: RefObject<HTMLElement | null>
  skin: RefObject<HTMLDivElement | null>
  reel: RefObject<HTMLSpanElement | null>
  typed: RefObject<HTMLSpanElement | null>
  caret: RefObject<HTMLSpanElement | null>
}): void {
  const dwell = useTick()
  // Which corpus the title is currently showing, so a beat knows whether it is
  // arriving on a new one. Written when the timeline is built rather than when
  // it finishes, so a beat interrupted by a keystroke and rebuilt does not fade
  // a title in that is already there.
  const held = useRef<SampleSet | null>(null)

  useGSAP(
    () => {
      const line = typed.current
      const bar = caret.current
      const box = skin.current
      const rail = reel.current
      const heading = hero.current?.querySelector('h1')
      if (!line || !bar || !box || !rail || !heading || !rotating) return

      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: reduce)', () => {
        line.textContent = sample
        gsap.set(bar, { opacity: 0 })
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const next = TICKS[(at + 1) % TICKS.length]!
        const arriving = held.current !== null && held.current !== tick.set
        const leaving = next.set !== tick.set
        held.current = tick.set

        // How much of the sample can be on screen at once, which is the field's
        // width less the padding either side of it. Read once per beat: it only
        // changes when the window does, and a window that changed mid-beat gets
        // the right answer on the next one.
        const pad = getComputedStyle(box)
        const room =
          box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)

        line.textContent = ''
        gsap.set(box, { opacity: 1 })
        gsap.set(rail, { x: 0 })
        gsap.to(bar, { opacity: 0, duration: BLINK, repeat: -1, yoyo: true, ease: 'steps(1)' })

        const tl = gsap.timeline({
          onComplete: () => setAt((a) => (a + 1) % TICKS.length),
        })
        if (arriving) {
          tl.fromTo(heading, { opacity: 0 }, { opacity: 1, duration: FADE, ease: 'none' })
        }
        for (let i = 0; i < sample.length; i++) {
          const upto = sample.slice(0, i + 1)
          tl.call(
            () => {
              line.textContent = upto
              // The reel slides left exactly as far as the text overruns, so the
              // caret stays at the right edge instead of typing off into the
              // clipped margin. This is what an input does with a caret at its
              // end, and it is the reason for the extra element: `overflow` can
              // clip the sentence or show it, but only a transform can follow it.
              gsap.set(rail, { x: Math.min(0, room - rail.offsetWidth - CARET_ROOM) })
            },
            undefined,
            `+=${keystroke(sample[i - 1])}`,
          )
        }
        // The dwell is the gap before the clear rather than a tween of its own:
        // an empty tween (`tl.to({}, …)`) has nothing to animate and GSAP takes
        // it out of the timeline, which is a three-second hold that silently
        // becomes none — measured on the page, where the samples went by in
        // half a second each.
        tl.to(box, { opacity: 0, duration: CLEAR, ease: 'power1.in' }, `+=${dwell}`)
        if (leaving) tl.to(heading, { opacity: 0, duration: FADE, ease: 'none' }, '<')
      })

      return () => {
        mm.revert()
      }
    },
    // `revertOnUpdate` is the line that makes the dependency list mean what it
    // says. Without it the hook defers its cleanup to unmount, so a change to
    // any of the four adds a second callback to the same context and leaves the
    // first beat's timeline running: switch modes mid-sample and two timelines
    // write one placeholder, and the box flickers between "Youngstown" and the
    // Explorer's question at every tick — measured on the page, seven jumps in
    // under four seconds. With it, each change reverts the beat that was
    // running (its tweens killed, the inline styles it set restored) before the
    // next one is built, all inside one layout effect and so before a paint.
    { dependencies: [at, sample, rotating, dwell], scope: hero, revertOnUpdate: true },
  )
}

/**
 * How long to wait before the next character, in seconds.
 *
 * Typing is not metronomic and a metronome is what a constant interval sounds
 * like to the eye. So every keystroke is 30–45ms, and the one after a full stop
 * or a comma takes a beat longer — the hand pausing at the end of a clause,
 * which is the only part of human typing rhythm anyone actually notices. The
 * first character waits a little, so the box does not appear to have been typed
 * into before the reader looked at it.
 */
function keystroke(previous: string | undefined): number {
  const base = 0.03 + Math.random() * 0.015
  if (previous === undefined) return 0.18
  if (/[.,;:?!]/.test(previous)) return base + 0.18
  return base
}

/**
 * Small counts as words, larger ones as figures — the usual rule for prose, and
 * this line is prose. It reads the registry, so the day a twelfth corpus lands
 * the sentence says twelve without anyone remembering to come here.
 */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
      {/* One column, no gap — the same argument the corpus list above makes. Two ruled
          stacks whose result counts differ give two cadences that agree nowhere, and the
          sections have to touch for the rule between them to be the thing that separates
          them. A results list is a list. */}
      <div>
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
    // This was a bordered, rounded card on `bg-card`; it is a section on the page's own
    // paper now, opened by the same hairline the corpus list above is ruled with. The hub
    // was drawing a corpus two ways — a ruled row before a search, a box after one — and
    // the box was the half that said a corpus's results are a thing apart from the page.
    // One rule per corpus, `border-t` on the section itself so the cadence starts at the
    // top and travels with the section: a rule above the section *and* a second under its
    // header would be two rules per corpus, which stops reading as a separated group and
    // starts reading as a table. Spacing separates the header from its results instead,
    // and the results from each other — the rule here means "next corpus", and a finer
    // rule between items would compete with the only one that carries meaning.
    <article className="border-t border-lawfare-line py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 font-serif text-base font-semibold">
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
      {/* A corpus that found nothing is its header line and nothing else. The mono count
          beside the name already reads "0 total", so the paragraph that used to say "No
          matches in this corpus." under it was a second line saying the same thing — and
          on a fan of ten, most of them empty on a narrow query, ten such sections were
          ten tall blank blocks between the rules. The error keeps its destructive box:
          it is the exception on this surface, not the cadence. */}
      {block.error && (
        <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Search failed: {block.error}
        </p>
      )}
      {!block.error && block.results.length > 0 && (
        <ol className="mt-3 space-y-2 text-sm">
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

/** Longer label for the per-corpus section header. */
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
