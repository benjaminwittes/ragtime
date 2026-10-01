/**
 * The terrain: documents as ground.
 *
 * There is no stage here and no set. What a search brings back is drawn as the only
 * thing there is: each document a column of its own strata, standing shoulder to shoulder
 * with the ones nearest it, so that a few dozen of them are an outcrop — a ridge where the
 * long ones are, a flat where the notices are, a gap where the record has nothing. White
 * ground, one weight of line, no shading that is not a flat tint.
 *
 * It is organised and it is not built. Organised: where a column stands along the ground
 * is its date and nothing else (`record.ts` says what every other property is). Not built:
 * nobody draws a column's outline. Each one is given a place and a reach, and its outline
 * is whatever is nearer to it than to anything else — so where columns crowd they share
 * walls, and at the edge of an outcrop they are round. When another arrives, it starts
 * with no reach at all and takes its ground from its neighbours as it grows, and they
 * give way. That is the whole of the animation: nothing is choreographed, the tessellation
 * is recomputed and what moved, moved.
 *
 * This file is that geometry, and it is pure: places in, outlines and paths out.
 * `Terrain.tsx` runs it every frame.
 */

import { heightOf, type StageDoc } from './record.ts'

export type Pt = readonly [number, number]

/** A column, as the geometry sees it: where it stands, how far it reaches, how tall it is. */
export type Seed = { id: string; x: number; y: number; r: number; h: number }

/** The ground is this wide, in its own units. Everything else is measured against it. */
export const WIDE = 100
/** How far a column reaches when nothing crowds it, and the least two may stand apart. */
export const REACH = 1.78
export const APART = 2.72
/** The tallest a column may stand. Not much more than it is wide: these are rocks, not towers. */
export const TALLEST = 9.5
/** Depth is drawn at this fraction of its length: the ground is seen from above and in front. */
export const LIE = 0.5
/** The pitch of the strata. One for every column, so a taller one has more: length, counted. */
export const PITCH = 0.44

/** A number from 0 to 1 that is always the same for the same name and place in line. */
function chance(name: string, k: number): number {
  let h = 2166136261 ^ k
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The shape a column has when nothing crowds it: a boulder. Seven to nine faces, no two
 * the same width, and no two columns the same — but always the same for one document, so
 * it is the same rock every time it is drawn. Not a circle: a round thing with a flat top
 * is something somebody made.
 */
function rock(seed: Seed): Pt[] {
  const faces = 7 + Math.floor(chance(seed.id, 0) * 3)
  const turn = chance(seed.id, 1) * Math.PI * 2
  const points: Pt[] = []
  for (let i = 0; i < faces; i += 1) {
    const a = turn + ((i + (chance(seed.id, 10 + i) - 0.5) * 0.55) / faces) * Math.PI * 2
    const r = seed.r * (0.84 + chance(seed.id, 30 + i) * 0.3)
    points.push([seed.x + Math.cos(a) * r, seed.y + Math.sin(a) * r])
  }
  return hull(points)
}

/** The part of a convex polygon where `a·x + b·y <= c`. */
export function clip(poly: readonly Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const dp = a * p[0] + b * p[1] - c
    const dq = a * q[0] + b * q[1] - c
    if (dp <= 0) out.push(p)
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq)
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return out
}

/**
 * A column's outline: its own reach, less whatever is nearer to a neighbour. "Nearer" is
 * weighted by reach, so a column that is still growing — reach near nothing — holds almost
 * no ground and its neighbours' walls stand close around it; as its reach grows the walls
 * move out. That weighting is the difference between a column appearing and a column
 * arriving.
 */
export function outline(seed: Seed, all: readonly Seed[]): Pt[] {
  if (seed.r < 0.04) return []
  let poly = rock(seed)
  for (const other of all) {
    if (other === seed || other.r < 0.04) continue
    const dx = other.x - seed.x
    const dy = other.y - seed.y
    const reach = seed.r + other.r
    if (dx * dx + dy * dy >= reach * reach) continue
    const c = other.x * other.x + other.y * other.y - seed.x * seed.x - seed.y * seed.y - other.r * other.r + seed.r * seed.r
    poly = clip(poly, 2 * dx, 2 * dy, c)
    if (poly.length < 3) return []
  }
  return poly
}

const n = (value: number) => (Math.round(value * 100) / 100).toString()

/** What is drawn for one column: its walls in two flat tones, their edges, its strata, its top. */
export type Drawn = {
  /** Walls that face the reader squarely or to the left: the paper's own white. No line. */
  light: string
  /** Walls that face right: one flat tint, which is all the shading there is. No line. */
  shade: string
  /** The lines of the walls: the foot, the two sides, and a crease wherever two walls meet at a corner. */
  edge: string
  strata: string
  /** The top, as an SVG `points` list. */
  top: string
  /** The same outline drawn smaller, for a column that is open at the top. */
  inner: string
  /** A line across the top, for one that came out broken. */
  crack: string
}

export const NOTHING: Drawn = { light: '', shade: '', edge: '', strata: '', top: '', inner: '', crack: '' }

/** Two walls meet at a corner, and not round a curve, when the turn between them is sharper than this. */
const CORNER = 0.5

/**
 * An outline on the ground → a column on the page. The ground lies back ({@link LIE});
 * height is drawn straight up. Only the walls that face the reader are drawn, and a
 * column is drawn after everything behind it, so nothing needs hiding.
 *
 * A wall is filled facet by facet and lined only where a line means something: along its
 * foot, down its two sides, and down a real corner. A column standing alone is round, and
 * a round thing with a line down every facet is a fluted pillar — a piece of a building,
 * which is the one thing these are not.
 */
export function draw(poly: readonly Pt[], h: number): Drawn {
  if (poly.length < 3) return NOTHING
  const count = poly.length
  // The walls that face the reader are one run of the outline. Find where it starts:
  // going round clockwise, a wall faces the reader when it runs right to left.
  const faces = (i: number) => poly[(i + 1) % count][0] - poly[i][0] < -1e-6
  let start = -1
  for (let i = 0; i < count; i += 1) {
    if (faces(i) && !faces((i + count - 1) % count)) {
      start = i
      break
    }
  }
  let light = ''
  let shade = ''
  let strata = ''
  let edge = ''
  if (start !== -1) {
    const first = poly[start]
    edge = `M${n(first[0])},${n(first[1] * LIE - h)}L${n(first[0])},${n(first[1] * LIE)}`
    for (let step = 0; step < count; step += 1) {
      const i = (start + step) % count
      if (!faces(i)) break
      const p = poly[i]
      const q = poly[(i + 1) % count]
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const py = p[1] * LIE
      const qy = q[1] * LIE
      const wall = `M${n(p[0])},${n(py - h)}L${n(q[0])},${n(qy - h)}L${n(q[0])},${n(qy)}L${n(p[0])},${n(py)}Z`
      if (dy > -dx * 0.35) shade += wall
      else light += wall
      edge += `L${n(q[0])},${n(qy)}`
      for (let down = PITCH; down < h - 0.08; down += PITCH) {
        strata += `M${n(p[0])},${n(py - h + down)}L${n(q[0])},${n(qy - h + down)}`
      }
      // The next wall: a corner between this one and it gets a crease; a curve does not.
      const j = (i + 1) % count
      if (faces(j)) {
        const r = poly[(j + 1) % count]
        const turn = Math.abs(Math.atan2(dx * (r[1] - q[1]) - dy * (r[0] - q[0]), dx * (r[0] - q[0]) + dy * (r[1] - q[1])))
        if (turn > CORNER) edge += `M${n(q[0])},${n(qy - h)}L${n(q[0])},${n(qy)}`
      } else {
        edge += `L${n(q[0])},${n(qy - h)}`
      }
    }
  }
  let cx = 0
  let cy = 0
  for (const p of poly) {
    cx += p[0]
    cy += p[1]
  }
  cx /= count
  cy /= count
  const up = (p: Pt) => `${n(p[0])},${n(p[1] * LIE - h)}`
  const top = poly.map(up).join(' ')
  const inner = poly.map((p) => up([cx + (p[0] - cx) * 0.52, cy + (p[1] - cy) * 0.52])).join(' ')
  const xs = poly.map((p) => p[0])
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const wide = right - left
  const crack =
    `M${up([left, cy])}` +
    `L${up([left + wide * 0.3, cy + wide * 0.16])}` +
    `L${up([left + wide * 0.52, cy - wide * 0.14])}` +
    `L${up([left + wide * 0.74, cy + wide * 0.1])}` +
    `L${up([right, cy - wide * 0.05])}`
  return { light, shade, edge, strata, top, inner, crack }
}

/** The outline of a set of points: the smallest convex shape that holds them all. */
function hull(points: readonly Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: readonly Pt[]) => {
    const out: Pt[] = []
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  // Lower chain left to right, then the upper one back: on a screen, where y runs down,
  // that is the way a clock goes — the direction `draw` reads walls in.
  return [...half(sorted), ...half(sorted.reverse())]
}

/** Where the light comes from: how far a shadow falls along the ground, and across it, per unit of height. */
const LIGHT: Pt = [0.5, 0.34]

/**
 * What a column casts on the ground, as an SVG `points` list: the shape between its foot
 * and its foot moved along the light by its height. Hard-edged and one flat tone — the
 * depth in this drawing comes from shadows that have an edge, not from shading that fades.
 */
export function shadow(poly: readonly Pt[], h: number): string {
  if (poly.length < 3 || h < 0.05) return ''
  const cast = poly.map((p) => [p[0] + LIGHT[0] * h, p[1] + LIGHT[1] * h] as const)
  return hull([...poly, ...cast])
    .map((p) => `${n(p[0])},${n(p[1] * LIE)}`)
    .join(' ')
}

/** How far out from a column each contour of the ground runs, as multiples of its reach. */
export const CONTOURS = [3.3, 2.5, 1.75] as const

/**
 * How far the ground runs on in front of the last row, drawn: the outermost contour of
 * the nearest column, and the longest shadow. The axis is ruled below this, so that
 * nothing on the ground is ever drawn across its marks.
 */
export const SKIRT = (CONTOURS[0] - 2) * REACH * LIE + 1.1

/** Where everything stands, before any of it is drawn. */
export type Ground = {
  /** A place for each document, by id. `h` is its full height; `r` its full reach. */
  seeds: Seed[]
  /** The rows, back to front, each with the depth its middle lies at. */
  lanes: { name: string | null; y: number; count: number }[]
  /** The ends of the dated ground, in the axis's unit. Null when nothing has a place. */
  span: { from: number; to: number } | null
  /** Where the dated ground starts and ends, in ground units: marks are placed between them. */
  from: number
  to: number
  /** How many have no place on the axis, and stand apart at the left. */
  unplaced: number
  /** How deep the whole ground is. */
  deep: number
}

/**
 * Give every document a place.
 *
 * Along the ground, a document stands at its date, exactly: that is never adjusted. In
 * depth it stands as near the middle of its row as it can without standing on another —
 * so a busy year is deep, a quiet one is a single file, and the outline of a row seen
 * from above is the shape of the record over time. Rows are the collection's kinds, back
 * to front in the order they arrive. What has no date stands in a huddle at the left,
 * clear of the dated ground, because it is on the ground but not on the axis.
 */
export function ground(docs: readonly StageDoc[]): Ground {
  const names: (string | null)[] = []
  for (const doc of docs) if (!names.includes(doc.lane)) names.push(doc.lane)

  const at = docs.map((doc) => doc.at).filter((value): value is number => value !== null)
  let span: Ground['span'] = null
  if (at.length > 0) {
    const from = Math.min(...at)
    const to = Math.max(...at)
    span = from === to ? { from: from - 183, to: to + 183 } : { from, to }
  }
  const unplaced = docs.filter((doc) => doc.at === null).length
  // The left of the ground is kept for the rows' names, and, when anything is undated,
  // for the huddle of what has no place on the axis.
  const from = unplaced > 0 ? 29 : 17
  const to = WIDE - 6
  const step = APART * 0.9

  const seeds: Seed[] = []
  const lanes: Ground['lanes'] = []
  let edge = REACH + 0.5
  for (const name of names) {
    const mine = docs.filter((doc) => doc.lane === name)
    const dated = mine.filter((doc) => doc.at !== null).sort((a, b) => (a.at as number) - (b.at as number))
    const loose = mine.filter((doc) => doc.at === null)
    const placed: { x: number; o: number; doc: StageDoc }[] = []
    const fits = (x: number, o: number) => placed.every((p) => (p.x - x) ** 2 + (p.o - o) ** 2 >= APART * APART)
    for (const doc of dated) {
      const x = span ? from + (((doc.at as number) - span.from) / (span.to - span.from)) * (to - from) : (from + to) / 2
      let o = 0
      // Out from the middle, one side and then the other, until there is room.
      for (let k = 0; k < 400; k += 1) {
        o = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step
        if (fits(x, o)) break
      }
      placed.push({ x, o, doc })
    }
    // The undated: packed into the same kind of huddle, on ground of their own.
    loose.forEach((doc, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      placed.push({ x: 17 + column * APART + (row % 2) * (APART / 2), o: (row - Math.floor((loose.length - 1) / 6)) * step, doc })
    })
    const most = placed.reduce((max, p) => Math.max(max, Math.abs(p.o)), 0)
    const y = edge + most
    for (const p of placed) seeds.push({ id: p.doc.id, x: p.x, y: y + p.o, r: REACH, h: heightOf(p.doc) * TALLEST })
    lanes.push({ name, y, count: mine.length })
    edge = y + most + REACH * 2 + 1.6
  }
  return { seeds, lanes, span, from, to, unplaced, deep: Math.max(edge - 1.6, REACH * 2) }
}
