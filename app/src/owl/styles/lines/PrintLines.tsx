import { useEffect, useId, useMemo, useRef, type CSSProperties, type Ref } from 'react'
import { baseDesign } from '../../design'
import type { LampState } from './fields'
import type { LineKnobs, LineSubject } from './knobs'
import type { Print } from './print'
import type { Engrave } from './engrave'
import { drawFrame, seeded, STILL_WOBBLE, type Wobble } from './render'

/**
 * A line-tile drawing set the way the Print temperament sets the owl: the page re-seats on
 * the glass about six times a second, the hatching drifts and breathes, the ink and the
 * flame flicker, a light bar passes in ten steps. All of it stepped. With `print` off it is
 * the first lab's smooth figure.
 *
 * One frame loop, no React in it; it draws only when a step has turned over, and only while
 * the figure is on screen.
 */


const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** The page's own paper, so a band of light bleaches to what is behind the owl. */
const PAPER = 'var(--background, #fffdf2)'
const BAR_STEPS = 10
const BAR_SECONDS = 1.25
const CYCLE = 24

export function PrintLines({
  subject,
  size,
  state,
  knobs,
  print,
  moving = true,
  still = 0,
  ink: inkColour,
  fluid,
  engrave = null,
}: {
  subject: LineSubject
  size: number
  state: LampState
  knobs: LineKnobs
  print: Print
  moving?: boolean
  still?: number
  /** The engraving laid on the owl: a second screen cut across its darks, and a keyline. Keep it stable (a constant or a memo). */
  engrave?: Engrave | null
  /** The ink; the base design's navy without one. */
  ink?: string
  /**
   * In the app the owl is sized by the page's classes, not by a width of its own: the svg
   * then carries no width or height, takes `className` and `style`, and `size` is only the
   * size the lines are drawn for.
   */
  fluid?: { ref?: Ref<SVGSVGElement>; className?: string; style?: CSSProperties; title?: string; root?: Record<string, string | undefined> }
}) {
  const uid = useId().replace(/:/g, '')
  const pathRef = useRef<SVGPathElement>(null)
  const hatchRef = useRef<SVGPathElement>(null)
  const keyRef = useRef<SVGPathElement>(null)
  const pageRef = useRef<SVGGElement>(null)
  const barRef = useRef<SVGRectElement>(null)
  const toner = useRef<SVGGElement>(null)
  const ink = inkColour ?? baseDesign().palette.navy
  const filtered = print.scan
  const first = useMemo(() => drawFrame(subject, size, knobs, still, state, STILL_WOBBLE, engrave), [subject, size, knobs, still, state, engrave])
  const specks = useMemo(() => {
    const r = seeded(subject === 'c' ? 11 : 23)
    return Array.from({ length: 16 }, () => ({ x: 6 + r() * 88, y: 6 + r() * 88, r: 0.25 + r() * 0.55 }))
  }, [subject])

  useEffect(() => {
    const path = pathRef.current
    const page = pageRef.current
    const hatch = hatchRef.current
    const key = keyRef.current
    if (!moving || !path || REDUCED()) return
    const rng = seeded(subject === 'c' ? 4 : 9)
    const cycle = Array.from({ length: CYCLE }, () => [rng(), rng(), rng(), rng()] as const)
    const flick = Array.from({ length: 16 }, () => rng())
    const a = print.amount
    let raf = 0
    let visible = true
    let drawn = -1
    let seat = -1
    let lit = -1
    const start = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      const e = (performance.now() - start) / 1000
      const anyPrint = print.boil || print.breath || print.flicker
      // Stepped: the drawing's own time moves in whole steps, so it is shot on twos, not smooth.
      const step = anyPrint || print.scan ? Math.floor(e * print.fps) : -1
      const t = step < 0 ? e : step / print.fps
      const k = step < 0 ? Math.floor(e * 60) : step
      if (k !== drawn) {
        drawn = k
        const sixth = Math.floor(e * 6)
        const [bx, by] = cycle[sixth % CYCLE]
        const wobble: Wobble = anyPrint
          ? {
              dx: print.boil ? (bx - 0.5) * 2 * 0.3 * a : 0,
              dy: print.boil ? (by - 0.5) * 2 * 0.3 * a : 0,
              breath: print.breath ? Math.sin(t * 1.1) * Math.min(1, a) : 0,
              gutter: print.flicker ? flick[Math.floor(e * 9) % 16] * Math.min(1, a) : 0,
            }
          : STILL_WOBBLE
        const f = drawFrame(subject, size, knobs, t, state, wobble, engrave)
        path.setAttribute('d', f.d)
        hatchRef.current?.setAttribute('d', f.hatch)
        keyRef.current?.setAttribute('d', f.key)
        if (print.flicker) path.setAttribute('opacity', String(1 - 0.07 * a * flick[(Math.floor(e * 9) + 5) % 16]))
        else path.removeAttribute('opacity')
      }
      // The page re-seats six times a second: a hair of a unit and of a degree.
      const sixth = Math.floor(e * 6)
      if (sixth !== seat && pageRef.current) {
        seat = sixth
        const [x, y, r] = cycle[sixth % CYCLE]
        pageRef.current.style.transform = print.boil
          ? `translate(${(x - 0.5) * 2 * 0.22 * a}px, ${(y - 0.5) * 2 * 0.22 * a}px) rotate(${(r - 0.5) * 2 * 0.12 * a}deg)`
          : ''
      }
      if (toner.current && print.scan) {
        const f = Math.floor(e * 9)
        if (f !== lit) {
          lit = f
          toner.current.setAttribute('opacity', String(0.25 + 0.6 * flick[f % 16]))
        }
      }
      const bar = barRef.current
      if (bar) {
        const into = print.bar ? e % print.barEvery : Infinity
        if (into < BAR_SECONDS) {
          const s = Math.floor((into / BAR_SECONDS) * BAR_STEPS)
          bar.setAttribute('x', String(-16 + (s / (BAR_STEPS - 1)) * 116))
          bar.setAttribute('opacity', '1')
        } else bar.setAttribute('opacity', '0')
      }
    }
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting))
    io.observe(path.ownerSVGElement ?? path)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      const rest = drawFrame(subject, size, knobs, still, state, STILL_WOBBLE, engrave)
      path.setAttribute('d', rest.d)
      hatch?.setAttribute('d', rest.hatch)
      key?.setAttribute('d', rest.key)
      path.removeAttribute('opacity')
      if (page) page.style.transform = ''
    }
  }, [moving, subject, size, knobs, state, print, still, engrave])

  return (
    <svg
      ref={fluid?.ref}
      {...(fluid ? {} : { width: size, height: size })}
      {...fluid?.root}
      viewBox="0 0 100 100"
      role={fluid?.title ? 'img' : undefined}
      aria-hidden={fluid?.title ? undefined : true}
      className={'block overflow-visible' + (fluid?.className ? ' ' + fluid.className : '')}
      style={{ color: ink, ...fluid?.style }}
    >
      {fluid?.title ? <title>{fluid.title}</title> : null}
      <defs>
        {/* Photocopy: spread the ink, clip it hard to one bit, wobble the edge a little. Static, so no pass is repeated for nothing. */}
        <filter id={`scan-${uid}`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.45" result="w" />
          <feGaussianBlur in="w" stdDeviation="0.16" result="b" />
          <feComponentTransfer in="b">
            <feFuncA type="linear" slope="3" intercept="-0.9" />
          </feComponentTransfer>
        </filter>
        <clipPath id={`disc-${uid}`}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
        <linearGradient id={`fade-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: PAPER }} stopOpacity="0" />
          <stop offset="0.55" style={{ stopColor: PAPER }} stopOpacity="0.85" />
          <stop offset="1" style={{ stopColor: PAPER }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g ref={pageRef} style={{ transformOrigin: '50px 50px' }}>
        <g filter={filtered ? `url(#scan-${uid})` : undefined}>
          <path ref={pathRef} d={first.d} fill="currentColor" />
          {engrave ? (
            <>
              <path ref={hatchRef} d={first.hatch} transform={first.hatchTransform} fill="currentColor" />
              <path ref={keyRef} d={first.key} fill="none" stroke="currentColor" strokeWidth={engrave.keyline} strokeLinecap="round" />
            </>
          ) : null}
        </g>
        {filtered ? (
          <g ref={toner} fill="currentColor" opacity="0.5">
            {specks.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} />
            ))}
          </g>
        ) : null}
      </g>
      {print.bar ? (
        <g clipPath={`url(#disc-${uid})`} pointerEvents="none">
          <rect ref={barRef} x="-16" y="0" width="16" height="100" fill={`url(#fade-${uid})`} opacity="0" />
        </g>
      ) : null}
    </svg>
  )
}
