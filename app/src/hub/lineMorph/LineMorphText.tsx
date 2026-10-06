import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { UNIT_PX } from '../textLines'
import { frameAt, measureMorph, revealMask, timing, toneOf, type Measured, type MorphParams } from './engine'
import MorphArt from './MorphArt'

/**
 * Text that writes itself as lines, once, and ends as the text.
 *
 * The text is the real text, always: it keeps its words, its selection and its place in the layout, and it is
 * the only copy of itself. It is revealed slice by slice by a CSS mask (`revealMask`, `engine.ts`) while the
 * lines (`MorphArt`) are drawn in an svg behind it. When the morph has finished the mask is taken off and
 * nothing else changes, because nothing was swapped. With reduced motion there is no morph and the text is
 * simply there.
 *
 *   <span wrap, positioned>          the box the svg and the text share
 *     <svg>                          the lines, behind the text
 *     <span block, masked>text</span>
 *   </span>
 *
 * It takes its font, size and colour from where it is put, and its line spacing follows the type size, so a
 * small note has finer lines and not fewer of them. Give it `t` (0 to 1) to hold it at a frame; without `t` it
 * plays, at the one swipe speed (`timing`), as soon as it has laid the text out.
 */
export default function LineMorphText({
  text,
  params,
  pitch,
  t: held,
  onDone,
}: {
  text: string
  params: MorphParams
  /** Line spacing at the desktop title size (`measureMorph`). */
  pitch: number
  /** Hold the morph at this frame (0 to 1) instead of playing it. */
  t?: number
  onDone?: () => void
}) {
  const body = useRef<HTMLSpanElement>(null)
  const [m, setM] = useState<Measured | null>(null)
  const [t, setT] = useState(0)
  // Reduced motion: there is no morph, and the text is simply there.
  const [still] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [played, setPlayed] = useState(false)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    let raf = 0
    const draw = () => {
      const measured = measureMorph(el, pitch)
      if (measured) setM(measured)
    }
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(later)
    ro.observe(el)
    // The face may arrive after the first layout; the words are the same but the shapes are not.
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [text, pitch])

  // How long the whole takes at the one swipe speed: a longer text takes longer, a shorter one less.
  const total = m ? timing(m, params).total : 0
  const totalRef = useRef(total)
  useEffect(() => {
    totalRef.current = total
  }, [total])

  // Play once, as soon as there is a layout to play on. A resize or a late font re-measures, and the clock
  // carries on against the new length.
  const ready = m !== null
  const playing = held === undefined && !still
  useEffect(() => {
    if (!ready || !playing) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / 1000 / Math.max(1e-3, totalRef.current))
      setT(next)
      if (next >= 1) {
        setPlayed(true)
        done.current?.()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, playing])
  useEffect(() => {
    if (still) done.current?.()
  }, [still])

  const now = held ?? t
  const toned = useMemo(() => (m ? toneOf(m, params.spread, params.gain) : null), [m, params.spread, params.gain])
  const frame = useMemo(() => (m && toned ? frameAt(m, toned, params, now) : null), [m, toned, params, now])
  const finished = still || played || (held !== undefined && held >= 1)
  const live = m !== null && frame !== null && !finished
  const mask = useMemo(() => (live && m ? revealMask(frame, m) : {}), [live, frame, m])

  return (
    <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
      <svg
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none"
        width={m?.w ?? 0}
        height={m?.h ?? 0}
        viewBox={m ? `0 0 ${m.w / UNIT_PX} ${m.h / UNIT_PX}` : undefined}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: -1, overflow: 'visible' }}
      >
        {live && m && frame ? <MorphArt m={m} frame={frame} /> : null}
      </svg>
      <span ref={body} style={{ display: 'block', ...mask }}>
        {text}
      </span>
    </span>
  )
}
