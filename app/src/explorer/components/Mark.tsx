import { useEffect, useRef } from 'react'

import { MARK } from '../mark/config.ts'
import { drawGlyph, glyphHeight, restingGlyph, stepGlyph } from '../mark/glyph.ts'
import { markColor, prefersStill } from '../mark/page.ts'

/**
 * The mark while the page is working and there is no text to read: it draws in, then breathes.
 * Reduced motion gets the five lines at rest.
 */
export function Mark() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const c = cv.getContext('2d')
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const h = glyphHeight()
    cv.width = Math.round(MARK.width * dpr)
    cv.height = Math.round(h * dpr)
    const color = markColor(cv)
    const still = prefersStill()
    const s = restingGlyph()
    if (!still) s.p = 0
    let raf = 0
    let last = performance.now()
    let t = 0
    const draw = () => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, MARK.width, h)
      drawGlyph(c, s, color, t)
    }
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
      last = now
      t += dt
      stepGlyph(s, dt, true)
      draw()
      raf = requestAnimationFrame(frame)
    }
    if (still) draw()
    else raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="mark" style={{ width: MARK.width, height: glyphHeight() }} aria-hidden="true" />
}

/** The mark at rest: the signature after the last word of an answer. */
export function MarkSig() {
  const h = glyphHeight()
  const ys = Array.from({ length: MARK.lines }, (_, i) => h / 2 + (i - (MARK.lines - 1) / 2) * MARK.gap)
  return (
    <svg className="mark-sig" style={{ marginLeft: MARK.before, verticalAlign: -(h / 2 - MARK.lift) }} width={MARK.width} height={h} viewBox={`0 0 ${MARK.width} ${h}`} aria-hidden="true" focusable="false">
      {ys.map((y, i) => (
        <line key={i} x1={MARK.weight / 2} x2={MARK.width - MARK.weight / 2} y1={y} y2={y} stroke="currentColor" strokeWidth={MARK.weight} />
      ))}
    </svg>
  )
}
