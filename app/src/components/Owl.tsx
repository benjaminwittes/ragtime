import { useEffect, useId, useRef, useState } from 'react'
import { owlGaze } from '@/lib/owl-gaze'

/**
 * The RAGtime owl: an archivist in spectacles, carrying a lantern.
 *
 * Drawn from the avatar concepts Ben Wittes sent on 2026-09-30, and kept to them: every
 * shape and colour below is the one in the concept sheet, in the sheet's own 100×100
 * units. Two of the five concepts are here, under the names the sheet gave them —
 *
 *   `archivist`  "D · The owl archivist": the owl standing. The avatar, good down to the
 *                size of a line of text.
 *   `stacks`     "E · The owl archivist on the stacks": the same owl on three books. The
 *                one for the landing page.
 *
 * What this file adds is only what a still drawing could not have: the owl blinks, its
 * eyes follow a pointer, and its lantern can be lit. None of the three moves a pixel
 * outside the figure's own box, so an owl costs the page around it nothing — the same
 * rule the hub's tabs and Tab hint keep. All three stop for a reader who has asked for
 * reduced motion, and the eyes stay centred where there is no pointer to follow.
 *
 * It is not the mark. `Mark.tsx` is the fluting — the site bar, the favicon, the cursor
 * that paints an Explorer answer in — and stays what it was. The owl is a character and
 * the mark is a signature, and a page may have both.
 */

export type OwlPose = 'archivist' | 'stacks'

/**
 * `dark` is the drawing as sent: the lantern has its flame and throws no light. `lit` adds
 * a steady glow around it; `searching` breathes that glow, for while something is being
 * looked for.
 */
export type OwlLantern = 'dark' | 'lit' | 'searching'

const NAVY = '#1F2A44'
const CREAM = '#EFE6D2'
const SLATE = '#3D4C6E'
const WING = '#2E3B57'
const TAN = '#C9B48A'
const GOLD = '#E0A93A'
const LENS = '#F7E3A6'
const FLAME = '#F2B84B'

/**
 * Each pose's own measurements, lifted from its concept. The owl on the stacks is the
 * standing owl redrawn a little smaller and higher rather than the same shapes moved, so
 * the two are two tables and not one table and an offset.
 */
const POSES = {
  archivist: {
    body: 'M24 92 L24 62 Q24 42 50 36 Q76 42 76 62 L76 92 Z',
    head: 'M27 44 L34 14 L42 25 Q50 21 58 25 L66 14 L73 44 Q62 35 50 35 Q38 35 27 44 Z',
    face: { cy: 38, r: 13 },
    eyes: { left: 44, right: 56, cy: 38, r: 6, pupil: 2.2 },
    beak: '50,43 47.5,47.5 52.5,47.5',
    belly: { cy: 68, rx: 10, ry: 14 },
    wings: [
      { cx: 28, cy: 66, rx: 5, ry: 11 },
      { cx: 72, cy: 64, rx: 5, ry: 11 },
    ],
    lantern: {
      handle: { x: 74, y1: 73, y2: 77 },
      frame: { x: 68, y: 77, width: 12, height: 14 },
      flame: { x: 71.5, y: 80.5, width: 5, height: 7 },
    },
    books: [],
  },
  stacks: {
    body: 'M28 76 L28 56 Q28 38 50 32 Q72 38 72 56 L72 76 Z',
    head: 'M30 40 L36 12 L43 22 Q50 18 57 22 L64 12 L70 40 Q60 31 50 31 Q40 31 30 40 Z',
    face: { cy: 34, r: 12 },
    eyes: { left: 44.5, right: 55.5, cy: 34, r: 5.5, pupil: 2 },
    beak: '50,38.5 47.7,42.5 52.3,42.5',
    belly: { cy: 60, rx: 9, ry: 12 },
    wings: [
      { cx: 32, cy: 58, rx: 4.5, ry: 10 },
      { cx: 68, cy: 56, rx: 4.5, ry: 10 },
    ],
    lantern: {
      handle: { x: 70, y1: 64, y2: 67 },
      frame: { x: 65, y: 67, width: 11, height: 12 },
      flame: { x: 68, y: 70, width: 5, height: 6 },
    },
    books: [
      { x: 18, y: 88, width: 64 },
      { x: 21, y: 81, width: 58 },
      { x: 24, y: 74, width: 52 },
    ],
  },
} as const

/** How far a pupil may leave the middle of its lens, as a share of the lens's radius. */
const TRAVEL = 0.33

export function Owl({
  pose = 'archivist',
  lantern = 'dark',
  keepsHours = false,
  className,
  title,
}: {
  pose?: OwlPose
  lantern?: OwlLantern
  /**
   * An owl keeps late hours: with this set, a lantern nobody asked to light is lit anyway
   * after eight in the evening and before six in the morning, by the reader's own clock.
   */
  keepsHours?: boolean
  /** Sizes the figure. It is square, so a width is enough. */
  className?: string
  /** Give the owl a name only where it stands for something; beside text that speaks for it, it is decoration. */
  title?: string
}) {
  const p = POSES[pose]
  const svg = useRef<SVGSVGElement>(null)
  // Read once, when the owl arrives, rather than kept by a clock: a lantern that came on
  // at the stroke of eight under someone mid-sentence would be the page changing under
  // them, and a visit that spans the hour is rare enough to leave as it started.
  const [night] = useState(() => {
    const hour = new Date().getHours()
    return hour >= 20 || hour < 6
  })
  const shown: OwlLantern = lantern === 'dark' && keepsHours && night ? 'lit' : lantern
  // One gradient per owl, named per owl: two on a page sharing an id would both paint
  // with whichever the document found first.
  const glow = 'owl-glow-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const flame = {
    cx: p.lantern.flame.x + p.lantern.flame.width / 2,
    cy: p.lantern.flame.y + p.lantern.flame.height / 2,
  }
  const travel = p.eyes.r * TRAVEL
  const eyeY = p.eyes.cy

  useEffect(() => {
    const el = svg.current
    if (!el) return
    // Nothing to follow on a touch screen, and nothing that should move for a reader who
    // asked for stillness. Both are read once: an owl that starts following because a
    // mouse was plugged in mid-visit is not worth a listener on two media queries.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let x = 0
    let y = 0
    function look() {
      frame = 0
      if (!el) return
      const g = owlGaze(el.getBoundingClientRect(), eyeY, travel, x, y)
      // Written to the element rather than to state: this runs on every pointer move,
      // and a render per move for two circles would be the costliest thing on the page.
      el.style.setProperty('--owl-gaze-x', g.x.toFixed(2))
      el.style.setProperty('--owl-gaze-y', g.y.toFixed(2))
    }
    function onMove(e: PointerEvent) {
      x = e.clientX
      y = e.clientY
      if (!frame) frame = requestAnimationFrame(look)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [eyeY, travel])

  return (
    <svg
      ref={svg}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-owl={pose}
      data-lantern={shown}
      className={className ? 'owl ' + className : 'owl'}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor={FLAME} stopOpacity="0.85" />
          <stop offset="1" stopColor={FLAME} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={CREAM} />
      {p.books.map((b) => (
        <rect
          key={b.y}
          x={b.x}
          y={b.y}
          width={b.width}
          height="6"
          rx="1.5"
          fill="#FFFFFF"
          stroke={NAVY}
          strokeWidth="1.5"
        />
      ))}
      <path d={p.body} fill={NAVY} />
      <path d={p.head} fill={NAVY} />
      <circle cx="50" cy={p.face.cy} r={p.face.r} fill={SLATE} />
      {/* The lenses and the pupils close together and the rims do not: a blink that
          squashed the spectacles with the eyes behind them would be the owl taking its
          glasses off every six seconds. So what the concept draws as one circle with a
          stroke is two here — the fill, which blinks, and the rim over it, which stays.
          At rest the two are the concept's circle exactly. */}
      <g className="owl-eyes">
        <circle cx={p.eyes.left} cy={p.eyes.cy} r={p.eyes.r} fill={LENS} />
        <circle cx={p.eyes.right} cy={p.eyes.cy} r={p.eyes.r} fill={LENS} />
        <g className="owl-pupils">
          <circle cx={p.eyes.left} cy={p.eyes.cy} r={p.eyes.pupil} fill={NAVY} />
          <circle cx={p.eyes.right} cy={p.eyes.cy} r={p.eyes.pupil} fill={NAVY} />
        </g>
      </g>
      <circle cx={p.eyes.left} cy={p.eyes.cy} r={p.eyes.r} fill="none" stroke={GOLD} strokeWidth="2.5" />
      <circle cx={p.eyes.right} cy={p.eyes.cy} r={p.eyes.r} fill="none" stroke={GOLD} strokeWidth="2.5" />
      <polygon points={p.beak} fill={GOLD} />
      <ellipse cx="50" cy={p.belly.cy} rx={p.belly.rx} ry={p.belly.ry} fill={TAN} />
      {p.wings.map((w) => (
        <ellipse key={w.cx} cx={w.cx} cy={w.cy} rx={w.rx} ry={w.ry} fill={WING} />
      ))}
      {/* Under the lantern and over the owl, so a lit lantern lights the wing that holds
          it. Always in the document and transparent while dark, so lighting it is a
          change of ink and nothing is added to or taken from the figure. */}
      <circle className="owl-glow" cx={flame.cx} cy={flame.cy} r="17" fill={`url(#${glow})`} />
      <line
        x1={p.lantern.handle.x}
        y1={p.lantern.handle.y1}
        x2={p.lantern.handle.x}
        y2={p.lantern.handle.y2}
        stroke={GOLD}
        strokeWidth="2"
      />
      <rect {...p.lantern.frame} rx="2" fill={NAVY} stroke={GOLD} strokeWidth="2" />
      <rect {...p.lantern.flame} fill={FLAME} />
    </svg>
  )
}
