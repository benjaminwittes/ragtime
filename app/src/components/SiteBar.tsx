import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { AppLink } from '@/components/AppLink'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { cn } from '@/lib/utils'

/**
 * The site's one bar.
 *
 * Mounted once, in `App`, above the route switch — so it does not unmount when the
 * reader moves between the hub, the Explorer and a spoke. It replaces three bars that
 * used to claim the top of the screen: `SiteMasthead` (rendered inside each route, and
 * so remounted on every navigation), the hub's own near-duplicate `HubHeader`, and the
 * Search/Explorer pill under the hub's hero. On the Explorer and on every spoke it sat
 * directly above a second header band; that is the doubling this collapses.
 *
 * Left is the site: the wordmark home, the tagline, and the Explorer. The slash belongs
 * to the tagline rather than to the wordmark, so it hides with it — without the tagline
 * a stranded slash would read as "RAGtime / Explorer", a rule drawn between the brand
 * and a link instead of between the tagline and the link after it.
 *
 * Right is global: the docs overlay, AI access, and whose project this is. Both controls
 * used to be rendered again by every page that wanted them; they are state about the
 * reader rather than about the page, so they live here once.
 *
 * Between the two is the slot — {@link SiteBarActions} — which is how a route puts its
 * own controls in this bar without the bar knowing anything about them.
 */
export function SiteBar({ onExplorer }: { onExplorer: boolean }) {
  const setSlot = useContext(SlotRefContext)
  return (
    <header className="border-b border-lawfare-line bg-lawfare-paper">
      {/* Wrapping, and tighter at phone width, because 390px is where this row runs out:
          it now carries the brand lockup *and* whatever the route puts in the slot. The
          measures that used to buy the Explorer's own band a single row (abbreviated
          labels below `sm`, a hidden "beta") are still doing that work here. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 sm:gap-x-4 sm:px-6 sm:py-3">
        <div className="flex items-baseline gap-2 sm:gap-3">
          <AppLink
            to="/"
            aria-label="RAGtime — back to hub"
            className="font-serif text-xl font-semibold leading-[2.25rem] tracking-tight text-foreground sm:text-[1.875rem]"
          >
            RAGtime
          </AppLink>
          {/* The tagline and the note at the far right are the two things here that are
              neither the site's structure nor a control, so they are the two that wait
              for room — the tagline from `md`, the note from `lg`. They used to appear
              at `sm`, which was affordable when this row carried a brand and one link;
              now it also carries the page's own name and the whole site's controls, and
              measured at 640px the tagline alone left a corpus title 0px to render in.
              A reader who cannot see what corpus they are in has lost something; a
              reader who cannot see "research across government" has not. */}
          <span className="hidden font-serif text-[15px] italic text-lawfare-text-secondary md:inline">
            research across government
          </span>
          <span
            aria-hidden="true"
            className="hidden font-serif text-[15px] text-lawfare-muted md:inline"
          >
            /
          </span>
          {/* The Explorer is a route beside the hub, not a spoke: it has no card in the
              grid, so the way to it lives in the lockup, after the tagline — it is
              somewhere this site goes rather than something this page does, which is what
              the right-hand cluster is for. On the Explorer itself it is the current page,
              and below `sm` a link to where you already are is the cheapest thing in the
              row to give up to the controls that arrive with a conversation. */}
          <AppLink
            to="/explorer"
            aria-current={onExplorer ? 'page' : undefined}
            className={cn(
              'font-serif text-[15px] text-primary underline-offset-4 hover:underline aria-[current=page]:underline',
              onExplorer && 'hidden sm:inline',
            )}
          >
            Explorer
          </AppLink>
        </div>
        {/* The route's own controls. Empty on most surfaces, where it is just the spacer
            that pushes the global cluster right. A page that wants its controls on the
            right puts a `<span className="flex-1" />` of its own first.

            How far it may be squeezed depends on what is in it, which is what the
            `has-[button]` rule says. A label can give: a spoke title is `min-w-0
            truncate`, so the slot shrinks and the name is cut, and the row stays one
            line. A control cannot: buttons have a width and no shorter form, and at 640
            with a conversation open the slot was 24px of the 168 they need — measured,
            with the Explorer's two painting straight over the docs and access cluster.
            So a slot holding controls keeps its content's width, the row wraps, and that
            cluster moves to a second line instead of being written over. */}
        <div
          ref={setSlot}
          className="flex min-w-0 flex-1 items-center gap-2 has-[button]:min-w-fit"
        />
        <DocsTrigger />
        <AccessSettings />
        {/* Last to appear, first to go: see the tagline above. At `sm` this note and its
            gap were 121px of the 20px the row was over at 640, and it wrapped. */}
        <span className="hidden text-xs text-lawfare-muted lg:inline">
          a project of{' '}
          <span className="font-bold text-lawfare-text-secondary">Lawfare</span>
        </span>
      </div>
    </header>
  )
}

/**
 * Put something in the bar from a page that is not inside it.
 *
 * The bar is a sibling of the route, so a route cannot render into it by nesting. It
 * renders through a portal instead: the bar hands its slot element up to the provider,
 * and anything wrapped in `SiteBarActions` is rendered into that element while staying
 * where it is in the React tree — which is the whole point. The Explorer's trail toggle
 * and conversations picker are controls over conversation state that lives in
 * `ExplorerPage`; a spoke's title comes from the shell that knows which spoke it is.
 * Neither has to be lifted anywhere, and the bar stays ignorant of both.
 *
 * A portal rather than a context-held `ReactNode`: handing a node up would mean setting
 * state in an effect on every render (a new node each time, so a new render each time),
 * and the guard against that loop is more machinery than this.
 *
 * Renders nothing until the bar has mounted and reported its slot — one paint, and only
 * on first mount, since the bar never unmounts after that.
 */
export function SiteBarActions({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext)
  return slot ? createPortal(children, slot) : null
}

/**
 * Wraps the bar and the route together so the two ends of the slot can find each other.
 * `App` is the only caller.
 */
export function SiteBarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <SlotRefContext.Provider value={setSlot}>
      <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
    </SlotRefContext.Provider>
  )
}

/** The slot element, once the bar has mounted; read by `SiteBarActions`. */
const SlotContext = createContext<HTMLElement | null>(null)

/** The ref callback that reports it; read by the bar. */
const SlotRefContext = createContext<(el: HTMLElement | null) => void>(() => {})
