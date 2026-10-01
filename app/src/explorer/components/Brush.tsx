import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { MARK } from '../mark/config.ts'
import { drawGlyph, glyphHeight, restingGlyph, stepGlyph } from '../mark/glyph.ts'
import { markColor, prefersStill } from '../mark/page.ts'
import { advance, linesOf, locate, pathLength, SETTLE_RUNWAY, type Box, type Line } from '../mark/reveal.ts'

type Props = {
  /** Write the answer in with the mark. Fixed for the life of the component: it is not a toggle. */
  active: boolean
  /** The answer is still arriving. The brush then waits at the end of what has come for the rest. */
  live: boolean
  /** Told true when the brush starts and false when it is done, so the page does not scroll to the end meanwhile. */
  onPainting?: (painting: boolean) => void
  children: ReactNode
}

/**
 * The mark as the cursor. Wraps an answer the reader is watching arrive and writes it in
 * behind the five-line mark: the mark is at the end of what has been written, the words
 * behind it come up in the mark's colour and settle to ink, and when the last word is down
 * the mark ripples once and stays as the signature.
 *
 * **It writes what has arrived, when it arrives.** The answer is rendered as it streams,
 * and the brush closes on the end of it — at the pace it streams when it is keeping up,
 * and across a whole paragraph in a blink when one lands at once
 * (`mark/reveal.ts`). It does not wait for the answer to finish before starting, and it
 * does not walk a finished answer at one speed while the reader waits for words that are
 * already there.
 *
 * **The answer is only as tall as what has been written.** Its box ends at the foot of
 * the line the brush is on, so there is never a blank the size of the whole answer under
 * the first line of it.
 *
 * **It does not touch the text.** What is not yet written is hidden by a mask over the
 * answer — everything above the brush's line, and that line up to the brush — so React
 * goes on rendering the answer as it grows, and a link's underline or a table's rule is
 * written in with the words around it. The colour the fresh words wear is a wash laid over
 * the line behind the brush, not a colour set on any letter.
 *
 * Only an answer that arrived while the reader watched gets this. A restored one is just
 * read.
 */
export function Brush({ active, live, onPainting, children }: Props) {
  return active ? (
    <Painted live={live} onPainting={onPainting}>
      {children}
    </Painted>
  ) : (
    <>{children}</>
  )
}

function Painted({ live, onPainting, children }: Pick<Props, 'live' | 'onPainting' | 'children'>) {
  const host = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const told = useRef(onPainting)
  const arriving = useRef(live)
  useLayoutEffect(() => {
    told.current = onPainting
    arriving.current = live
  })
  useLayoutEffect(() => {
    const el = host.current
    const inner = page.current
    if (!el || !inner || prefersStill()) return
    return paint(
      el,
      inner,
      () => arriving.current,
      (b) => told.current?.(b),
    )
  }, [])
  return (
    <div ref={host} className="brush">
      <div ref={page} className="brush-page">
        {children}
      </div>
    </div>
  )
}

/** The nearest ancestor that scrolls, or null for the page itself. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * The lines of the answer as it is laid out now, measured without changing it: the box of
 * every run of text, in the order it is read. The signature is not text and is left out.
 */
function measure(page: HTMLElement): Line[] {
  const base = page.getBoundingClientRect()
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const boxes: Box[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text
    if (!/\S/.test(text.data) || text.parentElement?.closest('.mark-sig')) continue
    range.selectNodeContents(text)
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue
      boxes.push({ left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top })
    }
  }
  return linesOf(boxes)
}

function paint(el: HTMLElement, page: HTMLElement, arriving: () => boolean, setPainting: (painting: boolean) => void): () => void {
  const teal = markColor(el)
  const dpr = window.devicePixelRatio || 1
  const h = glyphHeight()
  const cw = MARK.width + MARK.trail
  const cv = document.createElement('canvas')
  cv.className = 'brush-glyph'
  cv.setAttribute('aria-hidden', 'true')
  cv.width = Math.round(cw * dpr)
  cv.height = Math.round(h * dpr)
  cv.style.width = cw + 'px'
  cv.style.height = h + 'px'
  cv.style.opacity = '0'
  // The colour the fresh words wear. One band on the brush's line, the mark's colour at
  // the brush and nothing a little way behind it; `lighten` (explorer.css) lets it change
  // ink and leave the paper alone.
  const wash = document.createElement('div')
  wash.className = 'brush-wash'
  wash.setAttribute('aria-hidden', 'true')
  wash.style.backgroundImage = `linear-gradient(90deg, rgb(${teal[0]} ${teal[1]} ${teal[2]} / 0), rgb(${teal[0]} ${teal[1]} ${teal[2]} / 1) ${Math.round((MARK.solid / (MARK.solid + MARK.edge)) * 100)}%)`
  el.append(wash, cv)
  const c = cv.getContext('2d')!

  el.setAttribute('data-painting', '')
  // Nothing is written yet: no height, until the first line is measured.
  page.style.overflow = 'hidden'
  page.style.maxHeight = '0px'
  setPainting(true)

  const g = restingGlyph()
  g.p = 0
  const scrolls = scroller(el)
  const fs = parseFloat(getComputedStyle(page).fontSize) || 16
  let follow = true
  const stop = () => (follow = false)
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchmove', stop, { passive: true })

  // The answer grows and re-wraps under the brush, and none of that is the brush's doing:
  // it is told when the lines it walks have changed, and measures them again.
  let lines: Line[] = []
  let total = 0
  let stale = true
  const changed = () => (stale = true)
  const mo = new MutationObserver(changed)
  mo.observe(page, { subtree: true, childList: true, characterData: true })
  const ro = new ResizeObserver(changed)
  ro.observe(page)

  let shown = 0
  let over = 0
  let t = 0
  let gy = 0
  let gl = 0
  let appear = 0
  let ended = false
  let raf = 0
  let doneAt = 0
  let last = performance.now()

  const mask = (value: string) => {
    page.style.setProperty('-webkit-mask-image', value)
    page.style.setProperty('mask-image', value)
  }

  const finish = () => {
    if (ended) return
    ended = true
    cancelAnimationFrame(raf)
    page.style.removeProperty('overflow')
    page.style.removeProperty('max-height')
    for (const name of ['mask-image', 'mask-size', 'mask-position', 'mask-repeat']) {
      page.style.removeProperty(name)
      page.style.removeProperty('-webkit-' + name)
    }
    cv.remove()
    wash.remove()
    el.removeAttribute('data-painting')
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchmove', stop)
    mo.disconnect()
    ro.disconnect()
    setPainting(false)
  }

  const frame = (now: number) => {
    // The first frame's timestamp can precede the clock read when the loop was set up, so dt is not trusted to be positive.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
    last = now
    t += dt
    if (stale) {
      stale = false
      lines = measure(page)
      total = pathLength(lines)
      // The text can get shorter under the brush (markdown closing a mark it had left
      // open). What was written stays written; the brush is simply at the end.
      if (shown > total) shown = total
    }
    const waiting = arriving()
    const moving = shown < total
    if (moving) {
      shown = advance(shown, total, dt)
      over = 0
    } else if (!waiting) over = Math.min(SETTLE_RUNWAY, over + MARK.speed * dt)

    const at = locate(lines, shown)
    if (at) {
      const line = lines[at.line]!
      const top = Math.max(0, line.top - 2)
      const tall = line.bottom - top + 3
      // The front of the text: the brush, less the lead it keeps over the words, plus
      // whatever it has run on past the last of them.
      const front = at.x + over - (moving ? MARK.lead : 0)
      page.style.maxHeight = (line.bottom + 4).toFixed(1) + 'px'
      // Everything above the brush's line, whole; the line itself, up to the brush, with
      // the last `edge` px of it coming up out of nothing.
      mask(`linear-gradient(#000, #000), linear-gradient(90deg, #000 ${(front - MARK.edge).toFixed(1)}px, rgb(0 0 0 / 0) ${front.toFixed(1)}px)`)
      const sizes = `100% ${top.toFixed(1)}px, 100% ${tall.toFixed(1)}px`
      const places = `0 0, 0 ${top.toFixed(1)}px`
      page.style.setProperty('-webkit-mask-size', sizes)
      page.style.setProperty('mask-size', sizes)
      page.style.setProperty('-webkit-mask-position', places)
      page.style.setProperty('mask-position', places)
      page.style.setProperty('-webkit-mask-repeat', 'no-repeat')
      page.style.setProperty('mask-repeat', 'no-repeat')

      const band = MARK.edge + MARK.solid
      const from = Math.max(line.left, front - band)
      wash.style.transform = `translate(${from.toFixed(1)}px, ${top.toFixed(1)}px)`
      wash.style.width = Math.max(0, Math.min(front, line.right + band) - from).toFixed(1) + 'px'
      wash.style.height = tall.toFixed(1) + 'px'
      // Past the last letter there is nothing left to colour: it fades as it leaves.
      wash.style.opacity = String(moving || waiting ? 1 : Math.max(0, 1 - over / SETTLE_RUNWAY))

      // The glyph is the brush: just past the front of the text, on the line's baseline.
      // On a new line it fades out and comes back at the start, with no travel between.
      const tx = at.x + MARK.before
      const ty = (line.top + line.bottom) / 2 + 0.348 * fs - MARK.lift - h / 2
      if (Math.abs(ty - gy) > 6) appear = Math.min(appear, 0.35)
      gy = ty
      appear = Math.min(1, appear + dt / 0.12)
      const gTarget = moving ? Math.min(MARK.trail, Math.max(0, tx)) : 0
      gl += (gTarget - gl) * (1 - Math.exp(-dt * (gTarget > gl ? 10 : 3.5)))
      cv.style.opacity = String(appear)
      cv.style.transform = `translate(${(tx - MARK.trail).toFixed(2)}px, ${gy.toFixed(2)}px)`
    }

    if (!moving && !waiting && at && over >= SETTLE_RUNWAY && g.pulse < 0 && !doneAt) {
      // Every word is down. What is left is the mark's own flourish, and the page can say so.
      el.setAttribute('data-painting', 'signing')
      g.pulse = 0
      doneAt = now
    }
    // While it waits for more to arrive it breathes, as the working mark does.
    stepGlyph(g, dt, !moving && waiting)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, cw, h)
    drawGlyph(c, g, teal, t, MARK.trail, gl)

    if (follow && at) {
      // Keep the glyph in view, easing rather than jumping.
      const view = scrolls ? scrolls.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const excess = el.getBoundingClientRect().top + gy + h - (view.bottom - 90)
      if (excess > 0) {
        const step = Math.min(60, excess * 0.3 + 1)
        if (scrolls) scrolls.scrollTop += step
        else window.scrollBy(0, step)
      }
    }

    // An answer with nothing in it has nothing to write and nothing to wait for.
    if ((doneAt && g.pulse < 0) || (!waiting && !lines.length)) finish()
    else raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return finish
}
