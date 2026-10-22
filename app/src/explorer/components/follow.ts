/**
 * Whether the page keeps up with the conversation as it grows, or leaves the reader where
 * they are.
 *
 * Two things move the conversation for the reader: it scrolls to its end as a turn comes
 * in (`Conversation`), and the brush keeps its glyph in view as it writes (`Brush`). Both
 * are right only for a reader who is at the end. A reader who has scrolled back up to read
 * an earlier answer while the next one is worked on was pulled back down on every event of
 * the turn, and could not read anything above it until it finished.
 *
 * So the reader is followed while they are at the end, and let go when they scroll up. They
 * rejoin by scrolling back down to the end, or by asking something new. Scrolling up is told
 * from the position itself rather than from the wheel or a touch, so a scrollbar dragged
 * or a key pressed counts the same as a wheel turned.
 *
 * Both share one record per scroller, so the brush starts where the conversation already
 * stands: a reader who scrolled up before the answer began is not followed by its brush.
 */

/** How near the end of the conversation counts as being at it, in pixels. */
export const NEAR_END = 80

/**
 * Whether the reader is still followed after one scroll. `top` is where the scroller is
 * now, `lastTop` where it was at the scroll before, `fromEnd` how far its view is from the
 * end. At the end is always followed. Moving up away from it lets go. Moving down, or
 * holding still, leaves the answer as it was. The page following the reader only moves down,
 * and a conversation that shrinks under a reader at the end leaves them at it, so neither is
 * taken for the reader scrolling up.
 */
export function following(was: boolean, { top, lastTop, fromEnd }: { top: number; lastTop: number; fromEnd: number }): boolean {
  if (fromEnd <= NEAR_END) return true
  if (top < lastTop - 1) return false
  return was
}

export type Follow = {
  /** The reader is at the end, or has not scrolled away from it. */
  readonly on: boolean
  /** Follow again: the reader asked something, so the page goes to where it is answered. */
  pin(): void
  /** Done with it; the last one released stops listening. */
  release(): void
}

type Shared = { on: boolean; users: number; stop(): void }
const shared = new Map<HTMLElement | Window, Shared>()

/** The nearest ancestor that is made to scroll, whether or not it has enough to yet, or the window. */
function scrollerOf(el: HTMLElement): HTMLElement | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return window
}

function position(s: HTMLElement | Window): { top: number; fromEnd: number } {
  if (s instanceof Window) {
    const doc = document.documentElement
    return { top: s.scrollY, fromEnd: doc.scrollHeight - s.scrollY - s.innerHeight }
  }
  return { top: s.scrollTop, fromEnd: s.scrollHeight - s.scrollTop - s.clientHeight }
}

/** The follow state of the conversation `el` sits in. Every caller must `release` it. */
export function followOf(el: HTMLElement): Follow {
  const s = scrollerOf(el)
  let rec = shared.get(s)
  if (!rec) {
    let lastTop = position(s).top
    const onScroll = () => {
      const now = position(s)
      r.on = following(r.on, { top: now.top, lastTop, fromEnd: now.fromEnd })
      lastTop = now.top
    }
    const r: Shared = { on: true, users: 0, stop: () => s.removeEventListener('scroll', onScroll) }
    s.addEventListener('scroll', onScroll, { passive: true })
    shared.set(s, r)
    rec = r
  }
  const r = rec
  r.users++
  let released = false
  return {
    get on() {
      return r.on
    },
    pin() {
      r.on = true
    },
    release() {
      if (released) return
      released = true
      if (--r.users === 0) {
        r.stop()
        shared.delete(s)
      }
    },
  }
}
