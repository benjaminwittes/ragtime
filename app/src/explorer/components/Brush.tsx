import { memo, useLayoutEffect, useRef, type ReactNode } from 'react'

import { MARK } from '../mark/config.ts'
import { drawGlyph, glyphHeight, restingGlyph, stepGlyph } from '../mark/glyph.ts'
import { inkColor, markColor, prefersStill } from '../mark/page.ts'
import { advance, letterColor, letterLook, lineIds, SETTLE_RUNWAY } from '../mark/reveal.ts'

type Props = {
  /** Paint the answer in with the mark. Fixed for the life of the component: it is not a toggle. */
  active: boolean
  /** Told true when the brush starts and false when it is done, so the page does not scroll to the end meanwhile. */
  onPainting?: (painting: boolean) => void
  children: ReactNode
}

/**
 * The mark as the cursor. Wraps an answer that has just arrived, lays all of it out invisibly,
 * then reveals it behind a brush: the five-line mark moves left to right at one speed, the
 * letters behind it appear in the mark's colour and settle to ink, and when it has passed the
 * last word the mark ripples once and stays as the signature.
 *
 * Only an answer that arrived live while the reader watched gets this. A restored one is just
 * read. Laying out first and revealing after means nothing reflows, so the brush cannot move
 * the text it is writing.
 */
export function Brush({ active, onPainting, children }: Props) {
  return active ? <Painted onPainting={onPainting}>{children}</Painted> : <>{children}</>
}

/** The rendered answer, rendered once. After it mounts the brush owns its DOM, so React must not touch it again. */
const Frozen = memo(
  ({ children }: { children: ReactNode }) => <>{children}</>,
  () => true,
)

function Painted({ onPainting, children }: Pick<Props, 'onPainting' | 'children'>) {
  const host = useRef<HTMLDivElement>(null)
  const told = useRef(onPainting)
  useLayoutEffect(() => {
    told.current = onPainting
  })
  useLayoutEffect(() => {
    const el = host.current
    if (!el || prefersStill()) return
    return paint(el, (b) => told.current?.(b))
  }, [])
  return (
    <div ref={host} className="brush">
      <Frozen>{children}</Frozen>
    </div>
  )
}

/** Whitespace between blocks (the newlines markdown leaves in a list or a table) takes no space and is not a letter. */
const BLOCKS = new Set(['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'BLOCKQUOTE', 'DIV', 'SECTION'])

/** Put every letter of the answer in a span of its own, in reading order. Safe to run twice on one element. */
function wrap(el: HTMLElement): HTMLElement[] {
  if (!el.querySelector('[data-c]')) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
    for (const t of nodes) {
      const parent = t.parentElement
      if (!parent || parent.closest('.mark-sig')) continue
      if (!/\S/.test(t.data) && BLOCKS.has(parent.tagName)) continue
      const frag = document.createDocumentFragment()
      for (const ch of Array.from(t.data)) {
        const s = document.createElement('span')
        s.setAttribute('data-c', '')
        s.style.opacity = '0'
        s.textContent = ch
        frag.append(s)
      }
      t.replaceWith(frag)
    }
  }
  return Array.from(el.querySelectorAll<HTMLElement>('[data-c]'))
}

/** The nearest ancestor that scrolls, or null for the page itself. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

function paint(el: HTMLElement, setPainting: (painting: boolean) => void): () => void {
  const all = wrap(el)
  const cr = el.getBoundingClientRect()
  const rects = all.map((c) => c.getBoundingClientRect())
  // A letter with no width (a collapsed space at a line break) has nowhere to be painted: it is already there.
  const letters: HTMLElement[] = []
  const boxes: DOMRect[] = []
  all.forEach((c, i) => {
    if (rects[i]!.width > 0.01) {
      letters.push(c)
      boxes.push(rects[i]!)
    } else c.style.opacity = '1'
  })
  const n = letters.length
  if (!n) return () => {}

  const ids = lineIds(boxes)
  const pos = boxes.map((b, i) => ({ l: b.left - cr.left, r: b.right - cr.left, line: ids[i]! }))
  const widths = boxes.map((b) => b.width)
  // The glyph's height depends on its line alone, so it cannot wobble within one.
  const lineY = new Map<number, number>()
  letters.forEach((c, i) => {
    if (lineY.has(ids[i]!)) return
    const b = boxes[i]!
    const fs = parseFloat(getComputedStyle(c).fontSize) || 16
    lineY.set(ids[i]!, (b.top + b.bottom) / 2 - cr.top + 0.348 * fs)
  })

  const teal = markColor(el)
  const ink = inkColor(el)
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
  el.append(cv)
  const c = cv.getContext('2d')!

  el.setAttribute('data-painting', '')
  setPainting(true)

  const g = restingGlyph()
  g.p = 0
  const W = Math.max(1, el.clientWidth)
  const scrolls = scroller(el)
  let follow = true
  const stop = () => (follow = false)
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchmove', stop, { passive: true })

  // Hidden to begin with, whatever an earlier run of this effect left behind.
  for (const l of letters) {
    l.style.opacity = '0'
    l.style.color = ''
  }
  const seen = new Array<number>(n).fill(0)
  const kept = new Array<number>(n).fill(0)
  let settled = 0
  let shown = 0
  let over = 0
  let t = 0
  let gx = 0
  let gy = 0
  let gl = 0
  let appear = 0
  let first = true
  let ended = false
  let raf = 0
  let doneAt = 0
  let last = performance.now()

  const finish = () => {
    if (ended) return
    ended = true
    cancelAnimationFrame(raf)
    for (const l of letters) {
      l.style.opacity = '1'
      l.style.color = ''
    }
    cv.remove()
    el.removeAttribute('data-painting')
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchmove', stop)
    ro.disconnect()
    setPainting(false)
  }
  // The line numbers were measured at this width; at another the brush would walk the wrong path, so the answer just appears.
  const ro = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - W) > 0.5) finish()
  })
  ro.observe(el)

  const frame = (now: number) => {
    // The first frame's timestamp can precede the clock read when the loop was set up, so dt is not trusted to be positive.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
    last = now
    t += dt
    const moving = shown < n
    if (moving) shown = advance(shown, dt, widths)
    else over = Math.min(SETTLE_RUNWAY, over + MARK.speed * dt)

    const j = Math.min(Math.floor(shown), n - 1)
    const pj = pos[j]!
    const fx = pj.l + Math.min(1, shown - j) * (pj.r - pj.l)
    const front = pj.line * W + fx + over - MARK.lead
    // Letters from `settled` on are the only ones still changing; everything before is ink.
    let contiguous = true
    for (let i = settled; i <= Math.min(n - 1, j + 1); i++) {
      const p = pos[i]!
      const look = letterLook(front - (p.line * W + p.l))
      // Neither ever goes back.
      const o = Math.max(seen[i]!, look.opacity)
      const k = Math.max(kept[i]!, look.settle)
      seen[i] = o
      kept[i] = k
      const s = letters[i]!.style
      s.opacity = String(o)
      s.color = letterColor(teal, ink, k)
      if (contiguous && o >= 1 && k >= 1) settled = i + 1
      else contiguous = false
    }

    // The glyph is the brush, a fixed distance past the front of the text. At a line end it fades out and reappears at the start of the next, with no travel between.
    const tx = fx + MARK.before
    const ty = (lineY.get(pj.line) ?? 0) - MARK.lift - h / 2
    if (first || Math.abs(ty - gy) > 6 || tx < gx - 8) {
      appear = first ? appear : 0
      first = false
    }
    gx = tx
    gy = ty
    appear = Math.min(1, appear + dt / 0.18)
    const gTarget = moving ? Math.min(MARK.trail, Math.max(0, tx)) : 0
    gl += (gTarget - gl) * (1 - Math.exp(-dt * (gTarget > gl ? 10 : 3.5)))
    cv.style.opacity = String(appear)
    cv.style.transform = `translate(${(gx - MARK.trail).toFixed(2)}px, ${gy.toFixed(2)}px)`

    if (!moving && over >= SETTLE_RUNWAY && g.pulse < 0 && !doneAt) {
      g.pulse = 0
      doneAt = now
    }
    stepGlyph(g, dt, false)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, cw, h)
    drawGlyph(c, g, teal, t, MARK.trail, gl)

    if (follow) {
      // Keep the glyph in view, easing rather than jumping.
      const view = scrolls ? scrolls.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const excess = el.getBoundingClientRect().top + gy + h - (view.bottom - 90)
      if (excess > 0) {
        const step = Math.min(40, excess * 0.2 + 1)
        if (scrolls) scrolls.scrollTop += step
        else window.scrollBy(0, step)
      }
    }

    if (doneAt && g.pulse < 0) finish()
    else raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return finish
}
