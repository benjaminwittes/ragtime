import { GRID, type Grid } from './field'

/**
 * Iso-lines of a shape's distance grid — the concentric lines of an engraved feather, or
 * of a topographic map. Marching squares, then the loose segments chained into polylines.
 * Positions are in figure units, ready for the same ribbon code the straight screens use.
 */

export type Polyline = { points: number[]; closed: boolean }

/** Edge pairs per case, as [from, to] over edges 0 top, 1 right, 2 bottom, 3 left. */
const CASES: Record<number, number[][]> = {
  1: [[3, 2]],
  2: [[2, 1]],
  3: [[3, 1]],
  4: [[0, 1]],
  6: [[0, 2]],
  7: [[0, 3]],
  8: [[0, 3]],
  9: [[0, 2]],
  11: [[0, 1]],
  12: [[3, 1]],
  13: [[2, 1]],
  14: [[3, 2]],
}

export function contourLines(grid: Grid, level: number): Polyline[] {
  const { w, h, data } = grid
  // A crossing is identified by the grid edge it sits on, so two cells that share an edge
  // agree on where it is without comparing floats.
  const crossing = new Map<number, [number, number]>()
  const links = new Map<number, number[]>()
  const segs: [number, number][] = []

  const pos = (i: number, j: number) => [(grid.x0 + i + 0.5) * GRID, (grid.y0 + j + 0.5) * GRID] as const

  const edgeKey = (i: number, j: number, edge: number): number => {
    switch (edge) {
      case 0:
        return 2 * (j * w + i)
      case 2:
        return 2 * ((j + 1) * w + i)
      case 3:
        return 2 * (j * w + i) + 1
      default:
        return 2 * (j * w + i + 1) + 1
    }
  }

  const cross = (i: number, j: number, edge: number): number => {
    const key = edgeKey(i, j, edge)
    if (!crossing.has(key)) {
      const [ai, aj, bi, bj] =
        edge === 0 ? [i, j, i + 1, j] : edge === 2 ? [i, j + 1, i + 1, j + 1] : edge === 3 ? [i, j, i, j + 1] : [i + 1, j, i + 1, j + 1]
      const a = data[aj * w + ai]
      const b = data[bj * w + bi]
      const t = a === b ? 0.5 : (level - a) / (b - a)
      const [ax, ay] = pos(ai, aj)
      const [bx, by] = pos(bi, bj)
      crossing.set(key, [ax + (bx - ax) * t, ay + (by - ay) * t])
    }
    return key
  }

  const link = (a: number, b: number) => {
    const s = segs.length
    segs.push([a, b])
    for (const k of [a, b]) {
      const list = links.get(k)
      if (list) list.push(s)
      else links.set(k, [s])
    }
  }

  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const tl = data[j * w + i] >= level
      const tr = data[j * w + i + 1] >= level
      const br = data[(j + 1) * w + i + 1] >= level
      const bl = data[(j + 1) * w + i] >= level
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)
      if (code === 0 || code === 15) continue
      if (code === 5 || code === 10) {
        const centre = (data[j * w + i] + data[j * w + i + 1] + data[(j + 1) * w + i] + data[(j + 1) * w + i + 1]) / 4 >= level
        const pairs =
          code === 5
            ? centre
              ? [[0, 3], [2, 1]]
              : [[0, 1], [3, 2]]
            : centre
              ? [[0, 1], [3, 2]]
              : [[0, 3], [2, 1]]
        for (const [a, b] of pairs) link(cross(i, j, a), cross(i, j, b))
        continue
      }
      for (const [a, b] of CASES[code]) link(cross(i, j, a), cross(i, j, b))
    }
  }

  const used = new Uint8Array(segs.length)
  const out: Polyline[] = []
  const other = (s: number, k: number) => (segs[s][0] === k ? segs[s][1] : segs[s][0])

  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue
    used[s0] = 1
    const keys: number[] = [segs[s0][0], segs[s0][1]]
    // Grow forward from the tail, then backward from the head.
    for (const side of [1, 0]) {
      for (;;) {
        const end = side === 1 ? keys[keys.length - 1] : keys[0]
        const next = (links.get(end) ?? []).find((s) => !used[s])
        if (next === undefined) break
        used[next] = 1
        const k = other(next, end)
        if (side === 1) keys.push(k)
        else keys.unshift(k)
      }
    }
    const closed = keys.length > 3 && keys[0] === keys[keys.length - 1]
    if (closed) keys.pop()
    const points: number[] = []
    for (const k of keys) {
      const p = crossing.get(k)
      if (p) points.push(p[0], p[1])
    }
    if (points.length >= 6) out.push({ points, closed })
  }
  return out
}

/** One round of corner cutting: the polyline keeps its shape and loses the grid's staircase. */
export function chaikin(points: readonly number[], closed: boolean): number[] {
  const n = points.length / 2
  if (n < 3) return points.slice()
  const out: number[] = []
  const last = closed ? n : n - 1
  if (!closed) out.push(points[0], points[1])
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n
    const ax = points[i * 2]
    const ay = points[i * 2 + 1]
    const bx = points[j * 2]
    const by = points[j * 2 + 1]
    out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by)
  }
  if (!closed) out.push(points[(n - 1) * 2], points[(n - 1) * 2 + 1])
  return out
}

/** Points at an even spacing along a polyline, with the arclength of each. */
export function resample(points: readonly number[], closed: boolean, step: number): { pts: number[]; s: number[] } {
  const n = points.length / 2
  const pts: number[] = []
  const s: number[] = []
  if (n < 2) return { pts, s }
  const segCount = closed ? n : n - 1
  let carry = 0
  let along = 0
  pts.push(points[0], points[1])
  s.push(0)
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n
    const ax = points[i * 2]
    const ay = points[i * 2 + 1]
    const dx = points[j * 2] - ax
    const dy = points[j * 2 + 1] - ay
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    let d = step - carry
    while (d <= len) {
      pts.push(ax + (dx * d) / len, ay + (dy * d) / len)
      s.push(along + d)
      d += step
    }
    carry = len - (d - step)
    along += len
  }
  if (closed) {
    pts.push(points[0], points[1])
    s.push(along)
  } else if (carry > 1e-6) {
    pts.push(points[(n - 1) * 2], points[(n - 1) * 2 + 1])
    s.push(along)
  }
  return { pts, s }
}
