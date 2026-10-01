import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { useDocs } from '@/docs/DocsContext'
import { navigateTo, toHref, toLogical } from '@/lib/routing'

import { TOUR_EVENT } from './start.ts'
import {
  STEPS,
  TOUR,
  inView,
  isTall,
  placeCard,
  tourRequested,
  withoutTour,
  type Box,
} from './steps.ts'

/** How far the ring stands off the thing it is round. */
const RING = 4

/**
 * How many frames to look for a step's target before giving up and showing the card in
 * the middle. A route change is not instant — the router wraps it in a view transition —
 * so the first frames after one legitimately find nothing; forty is two thirds of a
 * second, which is longer than the transition and shorter than a reader's patience.
 */
const WAIT_FRAMES = 40

/** Where everything is for one step. Stamped with the step, so a stale one is not drawn. */
type Layout = { step: number; spot: Box | null; top: number; left: number }

/**
 * The guided tour (`steps.ts`): a small card that walks a first visit through the page,
 * pointing at the real controls.
 *
 * Mounted once in `App`, beside the route rather than inside one, because the tour crosses
 * routes: it can be started from a spoke and its second step is on the hub. It starts
 * three ways — a link that carries `?tour` (on arrival, or when an in-app link pushes one
 * into the address), and the hub's own "Take the tour" (`start.ts`) — and none of them
 * restarts a tour that is already running.
 *
 * **It never traps the reader.** The dimming and the ring take no pointer events, so every
 * control on the page works while the tour is up, including the one being pointed at:
 * "type a phrase here" is an invitation, not a picture. It is not a modal dialog and does
 * not hold the focus; the card's own button takes the focus when a step arrives so Enter
 * moves on, and Tab leaves it as it would leave anything else.
 *
 * **It sits under the sheets, not over them.** The card and the ring are at z-index 45 and
 * 44; the docs and AI access sheets, and the feedback panel, are at 50. So when a reader
 * opens one of the things the tour has just pointed at, that thing covers the tour, and
 * the tour is where it was when the sheet closes. While a sheet is open the tour also
 * ignores the keyboard: Escape there means "close the sheet", and an arrow key belongs to
 * whatever is in it.
 *
 * **Nothing here animates.** The ring is re-read from the target every frame and drawn
 * where the target is, so it follows a scroll or a re-wrap exactly instead of easing
 * after it, and a move between steps is a cut. That is also the whole of what
 * `prefers-reduced-motion` asks for, so there is no second code path to keep for it.
 *
 * Reading the target every frame rather than on `scroll` and `resize` is deliberate: the
 * hub's title rotates, the bar wraps when a route puts controls in it, and a view
 * transition replaces the page under a step. None of those raise an event this could
 * listen for, and a frame callback that reads one rectangle costs nothing while a tour is
 * open and does not exist when one is not.
 */
export function Tour() {
  const docs = useDocs()
  const [at, setAt] = useState<number | null>(() =>
    tourRequested(window.location.search) ? 0 : null,
  )
  const [layout, setLayout] = useState<Layout | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)

  // The two ways in that are not "the page was opened on it". Neither restarts a tour
  // that is running: a reader on step five who follows a link carrying `?tour` again has
  // not asked to be sent back to step one.
  useEffect(() => {
    const begin = () => setAt((now) => now ?? 0)
    const onPop = () => {
      if (tourRequested(window.location.search)) begin()
    }
    window.addEventListener(TOUR_EVENT, begin)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener(TOUR_EVENT, begin)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  // One step: go where it needs to be, find what it points at, bring that on screen once,
  // and then keep the ring and the card where the target is for as long as the step lasts.
  useEffect(() => {
    if (at === null) return
    const step = STEPS[at]
    if (step.route && toLogical(window.location.pathname) !== step.route) navigateTo(step.route)

    let frame = 0
    let raf = 0
    let brought = false
    let drawn = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      frame += 1
      const cardEl = card.current
      if (!cardEl) return
      const viewport = { width: window.innerWidth, height: window.innerHeight }

      let spot: Box | null = null
      const el = step.target ? document.querySelector(step.target) : null
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          spot = { top: r.top, left: r.left, width: r.width, height: r.height }
          // Once, and only once: after that the reader's own scrolling wins, and a tour
          // that kept pulling the page back would be the trap this is careful not to be.
          if (!brought) {
            brought = true
            if (!inView(spot, viewport)) {
              el.scrollIntoView({ block: isTall(spot, viewport) ? 'start' : 'center', behavior: 'instant' })
              return
            }
          }
        }
      }
      // Still looking: a target that is named but not here yet may be one route change
      // away. Draw nothing until it turns up or the wait runs out.
      if (spot === null && step.target && frame <= WAIT_FRAMES) return

      const size = cardEl.getBoundingClientRect()
      const { top, left } = placeCard(spot, { width: size.width, height: size.height }, viewport)
      const next = [spot?.top, spot?.left, spot?.width, spot?.height, top, left]
        .map((n) => (n === undefined ? '' : Math.round(n)))
        .join(',')
      if (next === drawn) return
      drawn = next
      setLayout({ step: at, spot, top, left })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [at])

  const placed = at !== null && layout !== null && layout.step === at

  // Enter moves on. `preventScroll`, because the card is fixed and already where it should
  // be; the browser scrolling "to" it would move the page under the step just arrived at.
  useEffect(() => {
    if (placed) primary.current?.focus({ preventScroll: true })
  }, [placed, at])

  useEffect(() => {
    if (at === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      // A sheet is open on top of the tour: the keyboard is the sheet's.
      if (document.querySelector('[data-slot="sheet-content"]')) return
      // Typing: an arrow moves the caret, and Escape clears or leaves the field.
      const target = event.target
      if (target instanceof HTMLElement && isEditable(target)) return
      if (event.key === 'Escape') {
        setAt(null)
        forgetRequest()
      } else if (event.key === 'ArrowRight') setAt((now) => (now === null ? now : Math.min(now + 1, STEPS.length - 1)))
      else if (event.key === 'ArrowLeft') setAt((now) => (now === null ? now : Math.max(now - 1, 0)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at])

  if (at === null) return null
  const step = STEPS[at]
  const link = step.link
  const last = at === STEPS.length - 1
  const spot = placed ? layout.spot : null

  function end() {
    setAt(null)
    forgetRequest()
  }

  // A real `href`, so the link can be copied or opened in a tab, and an in-app open on a
  // plain click, so following it does not reload the page the reader has just been shown.
  // A slug the docs do not hold yet opens the list of topics, which is where the reader
  // would look for it anyway.
  function follow(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    end()
    docs.open(slug)
  }

  return createPortal(
    <>
      {spot === null ? (
        <div
          aria-hidden="true"
          data-tour="scrim"
          className="pointer-events-none fixed inset-0 z-[44] bg-black/20"
        />
      ) : (
        // One element does both jobs: its border is the ring, and its shadow — spread far
        // past any window — is the dimming, with a hole exactly where the target is.
        <div
          aria-hidden="true"
          data-tour="ring"
          className="pointer-events-none fixed z-[44] rounded-md border-2 border-primary shadow-[0_0_0_200vmax_rgb(0_0_0/0.2)]"
          style={{
            top: spot.top - RING,
            left: spot.left - RING,
            width: spot.width + RING * 2,
            height: spot.height + RING * 2,
          }}
        />
      )}

      <div
        ref={card}
        role="dialog"
        aria-label={TOUR.label}
        data-tour="card"
        data-tour-step={step.id}
        // Laid out but not shown until it has been measured and placed, so it never
        // flashes in the corner on its way to where it belongs. Transparent rather than
        // `visibility: hidden`: the buttons inside carry `transition-all`, which makes an
        // inherited visibility a transition of its own, and for the first instant of it
        // the button is still hidden — which is the instant the focus is sent there, and
        // a hidden element refuses it.
        style={
          placed
            ? { top: layout.top, left: layout.left }
            : { top: 0, left: 0, opacity: 0, pointerEvents: 'none' }
        }
        className="fixed z-[45] grid w-[min(22rem,calc(100vw-1.5rem))] gap-2 rounded-lg border border-lawfare-line-strong bg-card p-3.5 text-sm text-foreground shadow-lg"
      >
        <div className="flex items-baseline justify-between gap-3">
          <strong className="font-serif text-base">{step.title}</strong>
          <button
            type="button"
            onClick={end}
            aria-label={TOUR.close}
            className="px-0.5 text-lg leading-none text-lawfare-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
        {step.body.map((line) => (
          <p key={line} className="text-[13px] leading-snug text-lawfare-text-secondary">
            {line}
          </p>
        ))}
        {link && (
          <p className="text-[13px]">
            <a
              href={toHref(`/?docs=${link.docs}`)}
              onClick={(event) => follow(event, link.docs)}
              className="text-primary underline underline-offset-2"
            >
              {link.label}
            </a>
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-lawfare-muted">
            {TOUR.position(at + 1, STEPS.length)}
          </span>
          <div className="flex gap-2">
            {at > 0 && (
              <Button variant="outline" size="sm" onClick={() => setAt(at - 1)}>
                {TOUR.back}
              </Button>
            )}
            <Button ref={primary} size="sm" onClick={last ? end : () => setAt(at + 1)}>
              {last ? TOUR.done : TOUR.next}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * Ending takes the request out of the address, so a reload does not start the tour again
 * and a reader who copies the address is not handing someone a tour. `replaceState`: this
 * is tidying the entry the reader is on, not a place they went.
 */
function forgetRequest(): void {
  if (!tourRequested(window.location.search)) return
  const { pathname, search, hash } = window.location
  window.history.replaceState(window.history.state, '', pathname + withoutTour(search) + hash)
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}
