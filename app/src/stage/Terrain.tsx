import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'

import { toHref } from '@/lib/routing'

import type { StageDoc } from './record.ts'
import { CONTOURS, LIE, REACH, WIDE, draw, outline, shadow, type Drawn, type Ground, type Seed } from './terrain.ts'

/** How quickly a column closes on where it is going: the time to cover about two thirds of the way. */
const EASE_MS = 190
/** How long after the one before it each column starts to grow, oldest first. */
const STAGGER_MS = 24
/** How long a column that is no longer in the answer takes to go back into the ground. */
const LEAVING_MS = 700

type Parts = {
  light: SVGPathElement
  shade: SVGPathElement
  edge: SVGPathElement
  strata: SVGPathElement
  top: SVGPolygonElement
  inner: SVGPolygonElement
  crack: SVGPathElement
}

/** One column as the animation holds it: where it is, where it is going, and its elements. */
type Cell = {
  el: Element
  parts: Parts
  /** What it casts on the ground, and the rings of ground round it; drawn under every column. */
  cast: Element | null
  rings: Element[]
  castWas: string
  now: Seed
  to: Seed
  /** Not before this moment: the stagger. */
  from: number
  drawn: Drawn | null
}

function attrsOf(doc: StageDoc) {
  return {
    'data-face': doc.face,
    'data-rough': doc.rough ? '' : undefined,
    'data-uncapped': doc.capped ? undefined : '',
    'data-film': doc.film > 0 ? '' : undefined,
    'data-marked': doc.marked ? '' : undefined,
  }
}

/**
 * The terrain, drawn and kept alive (`terrain.ts` is the geometry and the reasons).
 *
 * React renders one link per document and nothing inside it changes by React's hand: the
 * shapes are redrawn here, every frame that anything is still moving, from the outlines
 * the geometry gives back. So a column that arrives grows, and the ones round it give
 * way, and one that is no longer in the answer goes back into the ground before it is
 * taken out of the document. When everything has arrived the drawing stops, and what is
 * left moving is a slow rise and fall in CSS — enough to say it is not a chart.
 *
 * It is an SVG, so every column is a real link with a real label, and the whole thing is
 * the same drawing at any width.
 */
export function Terrain({
  docs,
  laid,
  marks,
  active,
  forward,
  onPoint,
  onPick,
  wingsSaid,
}: {
  docs: readonly StageDoc[]
  laid: Ground
  /** The marks along the front: where, as a fraction of the dated ground, and what they say. */
  marks: { x: number; label: string }[]
  active: string | null
  /** One has been brought forward for the room: the rest stand back. */
  forward: boolean
  onPoint: (id: string) => void
  onPick: (event: MouseEvent, id: string) => void
  wingsSaid: string
}) {
  // What has just left the answer, kept in the document long enough to be seen leaving.
  const [seen, setSeen] = useState(docs)
  const [leaving, setLeaving] = useState<StageDoc[]>([])
  if (docs !== seen) {
    const still = new Set(docs.map((doc) => doc.id))
    setLeaving([...leaving.filter((doc) => !still.has(doc.id)), ...seen.filter((doc) => !still.has(doc.id))])
    setSeen(docs)
  }
  useEffect(() => {
    if (leaving.length === 0) return
    const timer = window.setTimeout(() => setLeaving([]), LEAVING_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const svg = useRef<SVGSVGElement>(null)
  const cells = useRef(new Map<string, Cell>())
  const frame = useRef(0)
  const places = useMemo(() => new Map(laid.seeds.map((seed) => [seed.id, seed])), [laid])

  const run = useCallback(() => {
    if (frame.current) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let last = performance.now()
    const tick = (time: number) => {
      const k = still ? 1 : 1 - Math.exp(-(time - last) / EASE_MS)
      last = time
      let moving = false
      const all = [...cells.current.values()]
      for (const cell of all) {
        if (!still && time < cell.from) {
          moving = true
          continue
        }
        for (const key of ['x', 'y', 'r', 'h'] as const) {
          const gap = cell.to[key] - cell.now[key]
          if (Math.abs(gap) < 0.004) cell.now[key] = cell.to[key]
          else {
            cell.now[key] += gap * k
            moving = true
          }
        }
      }
      // Everything is redrawn while anything moves: one column growing changes the
      // outline of each of its neighbours.
      const seeds = all.map((cell) => cell.now)
      for (const cell of all) {
        const next = draw(outline(cell.now, seeds), cell.now.h)
        const was = cell.drawn
        if (!was || was.light !== next.light) cell.parts.light.setAttribute('d', next.light)
        if (!was || was.shade !== next.shade) cell.parts.shade.setAttribute('d', next.shade)
        if (!was || was.edge !== next.edge) cell.parts.edge.setAttribute('d', next.edge)
        if (!was || was.strata !== next.strata) cell.parts.strata.setAttribute('d', next.strata)
        if (!was || was.top !== next.top) {
          cell.parts.top.setAttribute('points', next.top)
          cell.parts.inner.setAttribute('points', next.inner)
          cell.parts.crack.setAttribute('d', next.crack)
        }
        cell.drawn = next
        const cast = shadow(outline(cell.now, seeds), cell.now.h)
        if (cell.cast && cast !== cell.castWas) {
          cell.cast.setAttribute('points', cast)
          cell.castWas = cast
        }
        // The ground round a column, as rings: a column that is growing draws its
        // contours out with it.
        const grown = cell.now.r / REACH
        for (const ring of cell.rings) {
          const reach = Number(ring.getAttribute('data-reach')) * cell.now.r * (0.35 + 0.65 * grown)
          ring.setAttribute('cx', String(Math.round(cell.now.x * 100) / 100))
          ring.setAttribute('cy', String(Math.round(cell.now.y * LIE * 100) / 100))
          ring.setAttribute('rx', String(Math.round(reach * 100) / 100))
          ring.setAttribute('ry', String(Math.round(reach * LIE * 100) / 100))
        }
      }
      // Back to front, so each column is drawn over what is behind it. The order only
      // changes when something has moved in depth, which is rare; when it has, the
      // elements are put back in order.
      const order = all.slice().sort((a, b) => a.now.y - b.now.y || a.now.x - b.now.x)
      const parent = svg.current?.querySelector('[data-terrain="cells"]')
      if (parent) {
        let at: Element | null = parent.firstElementChild
        for (const cell of order) {
          if (cell.el === at) at = at.nextElementSibling
          else parent.insertBefore(cell.el, at)
        }
      }
      frame.current = moving ? requestAnimationFrame(tick) : 0
    }
    frame.current = requestAnimationFrame(tick)
  }, [])

  // Stopped, and known to be stopped: in development an effect is run, undone and run
  // again, and a loop that was cancelled but still looked as if it were running would
  // never be started a second time.
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    [],
  )

  // Where each column is going. A new one starts where it will stand, with no reach and
  // no height; one that has left the answer is sent back to both.
  useEffect(() => {
    const time = performance.now()
    const order = [...places.values()].sort((a, b) => a.x - b.x)
    let fresh = 0
    for (const seed of order) {
      const cell = cells.current.get(seed.id)
      if (!cell) continue
      const arriving = cell.now.r === 0 && cell.to.r === 0
      cell.to = { ...seed }
      if (arriving) {
        cell.now.x = seed.x
        cell.now.y = seed.y
        cell.from = time + fresh * STAGGER_MS
        fresh += 1
      }
    }
    const going = new Set(leaving.map((doc) => doc.id))
    for (const id of [...cells.current.keys()]) {
      const cell = cells.current.get(id)
      if (cell && going.has(id)) cell.to = { ...cell.to, r: 0, h: 0 }
      else if (!places.has(id)) cells.current.delete(id)
    }
    run()
  }, [places, leaving, run])

  // A column's element, when React has one for it. What the animation knows about a
  // column outlives its element: in development React takes a new element away and gives
  // it back, and a column that forgot where it was going each time would never arrive. A
  // column is forgotten when its document has left (the effect above), not when its
  // element is let go.
  const register = useCallback((id: string, el: Element | null) => {
    if (!el) return
    const part = <T extends SVGElement>(name: string) => el.querySelector(`[data-part="${name}"]`) as unknown as T
    const under = el.closest('svg')
    const named = CSS.escape(id)
    const held = {
      el,
      parts: {
        light: part<SVGPathElement>('light'),
        shade: part<SVGPathElement>('shade'),
        edge: part<SVGPathElement>('edge'),
        strata: part<SVGPathElement>('strata'),
        top: part<SVGPolygonElement>('top'),
        inner: part<SVGPolygonElement>('inner'),
        crack: part<SVGPathElement>('crack'),
      },
      cast: under?.querySelector(`[data-cast="${named}"]`) ?? null,
      rings: [...(under?.querySelectorAll(`[data-ring="${named}"]`) ?? [])],
      castWas: '',
      drawn: null,
    }
    const known = cells.current.get(id)
    if (known) Object.assign(known, held)
    else {
      const zero: Seed = { id, x: 0, y: 0, r: 0, h: 0 }
      cells.current.set(id, { ...held, now: { ...zero }, to: { ...zero }, from: 0 })
    }
  }, [])

  const all = [...docs, ...leaving]
  const front = laid.deep * LIE
  // Room above the ground for the tallest thing on it, and no more: a search of short
  // documents is a low landscape, and is not drawn at the bottom of a tall empty box.
  const high = Math.max(4, ...laid.seeds.map((seed) => seed.h)) * 1.02 + 1.4
  const along = (x: number) => laid.from + x * (laid.to - laid.from)

  return (
    <svg
      ref={svg}
      className="terrain"
      viewBox={`0 ${-high} ${WIDE} ${high + Math.max(front, 9) + 4.6}`}
      data-forward={forward ? '' : undefined}
      role="group"
      aria-label={`${docs.length} documents`}
    >
      {laid.lanes.map(
        (lane) =>
          lane.name && (
            <text key={lane.name} className="terrain-lane" x={0.2} y={lane.y * LIE + 0.4}>
              {lane.name}
            </text>
          ),
      )}
      {/* The ground: contours round each outcrop, and what each column casts on it. Each
          contour is every column's ring drawn twice — all the lines, then all the fills
          over them in the ground's own colour — so that what is left showing is one line
          round the lot of them, however many there are. */}
      <g aria-hidden="true">
        {CONTOURS.map((reach) => (
          <g key={reach}>
            {all.map((doc) => (
              <ellipse key={doc.id} className="t-contour" data-ring={doc.id} data-reach={reach} />
            ))}
            {all.map((doc) => (
              <ellipse key={doc.id} className="t-ground" data-ring={doc.id} data-reach={reach} />
            ))}
          </g>
        ))}
        {all.map((doc) => (
          <polygon key={doc.id} className="t-cast" data-cast={doc.id} />
        ))}
      </g>
      <g data-terrain="cells">
        {all.map((doc) => (
          <Column
            key={doc.id}
            doc={doc}
            active={active === doc.id}
            lag={(places.get(doc.id)?.x ?? 0) * 70}
            register={register}
            onPoint={onPoint}
            onPick={onPick}
          />
        ))}
      </g>
      {/* The axis: one rule along the front of the dated ground, and its marks. */}
      {laid.span && (
        <g className="terrain-axis" aria-hidden="true">
          <line x1={laid.from - REACH} x2={laid.to + REACH} y1={front + 1} y2={front + 1} />
          {marks.map((mark) => (
            <g key={mark.label}>
              <line x1={along(mark.x)} x2={along(mark.x)} y1={front + 1} y2={front + 1.7} />
              <text x={along(mark.x)} y={front + 3.2} textAnchor="middle">
                {mark.label}
              </text>
            </g>
          ))}
        </g>
      )}
      {laid.unplaced > 0 && (
        <text className="terrain-axis" x={laid.from - 6} y={front + 3.2} textAnchor="middle" aria-hidden="true">
          {wingsSaid}
        </text>
      )}
    </svg>
  )
}

/** One document's link, and the empty shapes the animation draws into. */
function Column({
  doc,
  active,
  lag,
  register,
  onPoint,
  onPick,
}: {
  doc: StageDoc
  active: boolean
  lag: number
  register: (id: string, el: Element | null) => void
  onPoint: (id: string) => void
  onPick: (event: MouseEvent, id: string) => void
}) {
  const ref = useCallback((el: Element | null) => register(doc.id, el), [doc.id, register])
  return (
    <a
      ref={ref}
      className="terrain-cell"
      href={doc.href.startsWith('/') ? toHref(doc.href) : doc.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={doc.when ? `${doc.title}, ${doc.when}` : doc.title}
      data-terrain-doc={doc.id}
      data-active={active ? '' : undefined}
      // A slow rise and fall, out of step along the ground, so it passes through the
      // outcrop instead of the whole thing nodding at once.
      style={{ '--lag': `${-lag}ms` } as CSSProperties}
      onPointerEnter={() => onPoint(doc.id)}
      onFocus={() => onPoint(doc.id)}
      onClick={(event) => onPick(event, doc.id)}
      {...attrsOf(doc)}
    >
      <path data-part="light" className="t-wall" />
      <path data-part="shade" className="t-wall t-shade" />
      <path data-part="strata" className="t-strata" />
      <path data-part="edge" className="t-edge" />
      <polygon data-part="top" className="t-top" />
      <polygon data-part="inner" className="t-inner" />
      <path data-part="crack" className="t-crack" />
    </a>
  )
}
