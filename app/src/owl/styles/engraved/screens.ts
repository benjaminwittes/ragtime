import { chaikin, contourLines, resample } from './contour'
import { curve, ownerAt, sd, toneAt, valueNoise, type Field, type ToneParams } from './field'
import { simplify } from './geometry'
import { appendOutline, ribbonOutline } from './ribbon'

/**
 * Line screens: lines whose width carries tone, cut off where the shape they print ends.
 *
 * Every screen — straight, bent over the form, following its contours, a cross-hatch —
 * does the same last step: it is handed polylines, asks the field what the tone and the
 * owner are along each, turns tone into a width, and writes the stretches that carry ink
 * as ribbon polygons. Only how the polylines are made differs.
 */

export type Pen = {
  field: Field
  tone: ToneParams
  /** Shape indices this screen prints on. */
  shapes: ReadonlySet<number>
  bias: number
  /** Distance between samples along a line. */
  step: number
  /** Tolerance when thinning ribbon edges. */
  eps: number
  wmin: number
  /** The heaviest line, figure units. */
  wcap: number
  floor: number
  breakAt: number
  dash: number
  /** Tone under which this screen is silent, and the scale of its weight (a cross-hatch is lighter). */
  gate: number
  weight: number
  waver: number
  seed: number
  gamma: number
  contrast: number
  brightness: number
}

export type Tally = { ribbons: number; points: number }

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The width a line should have where the tone is `t`, `s` along it. */
export function widthAt(pen: Pen, t: number, s: number): number {
  const lo = Math.max(pen.floor, pen.gate)
  if (t <= lo) return 0
  const v = Math.min(1, (t - lo) / (1 - lo))
  // The tip tapers to nothing as the tone falls to the floor, which is what gives a
  // highlight its drawn-in look rather than a line that stops dead.
  let w = (pen.wmin + (pen.wcap - pen.wmin) * v) * smooth(0, 0.2, v) * pen.weight
  if (pen.breakAt > 0 && t < pen.breakAt) {
    const infl = Math.min(1, (pen.breakAt - t) / Math.max(pen.breakAt - lo, 1e-3))
    const c = 0.5 - 0.5 * Math.cos((2 * Math.PI * s) / pen.dash)
    const cut = -0.15 + infl * 1.1
    w *= smooth(cut - 0.12, cut + 0.12, c)
  }
  return w
}

type Sample = { x: number; y: number; s: number; w: number; inside: boolean }

function evaluate(pen: Pen, x: number, y: number, s: number): Sample {
  const own = ownerAt(pen.field, x, y)
  if (own < 0 || !pen.shapes.has(own)) return { x, y, s, w: 0, inside: false }
  const t = curve(toneAt(pen.field, own, x, y, pen.tone) + pen.bias, pen)
  return { x, y, s, w: widthAt(pen, t, s), inside: true }
}

/** Walk a dense polyline, find the stretches that carry ink, write each as a ribbon. */
function trace(pen: Pen, pts: readonly number[], arc: readonly number[], path: string, tally: Tally): string {
  const n = arc.length
  const samples: Sample[] = new Array(n)
  for (let i = 0; i < n; i++) samples[i] = evaluate(pen, pts[i * 2], pts[i * 2 + 1], arc[i])
  const live = (s: Sample) => s.inside && s.w > 0.015

  let i = 0
  while (i < n) {
    if (!live(samples[i])) {
      i++
      continue
    }
    const a = i
    let b = i
    while (b + 1 < n && live(samples[b + 1])) b++
    const run: Sample[] = []
    // A run that stopped because the shape did gets the true edge; one that stopped
    // because the tone did already ends in a point and gets a zero-width cap instead.
    if (a > 0) {
      const prev = samples[a - 1]
      if (prev.inside) run.push({ ...prev, w: 0 })
      else run.push(...edgePoint(pen, prev, samples[a]))
    }
    for (let k = a; k <= b; k++) run.push(samples[k])
    if (b + 1 < n) {
      const next = samples[b + 1]
      if (next.inside) run.push({ ...next, w: 0 })
      else run.push(...edgePoint(pen, samples[b], next))
    }
    i = b + 1
    if (run.length < 2) continue
    const xy: number[] = []
    const widths: number[] = []
    for (const r of run) {
      xy.push(r.x, r.y)
      widths.push(r.w)
    }
    const outline = ribbonOutline(xy, widths, pen.eps)
    const before = path.length
    path = appendOutline(path, outline)
    if (path.length > before) {
      tally.ribbons++
      tally.points += outline.length / 2
    }
  }
  return path
}

/** The point where a line crosses out of the shape between `inside` and `outside`, with its own width. */
function edgePoint(pen: Pen, inside: Sample, outside: Sample): Sample[] {
  const known = inside.inside ? inside : outside
  const other = inside.inside ? outside : inside
  let lo = 0
  let hi = 1
  for (let k = 0; k < 7; k++) {
    const m = (lo + hi) / 2
    const x = known.x + (other.x - known.x) * m
    const y = known.y + (other.y - known.y) * m
    const own = ownerAt(pen.field, x, y)
    if (own >= 0 && pen.shapes.has(own)) lo = m
    else hi = m
  }
  const x = known.x + (other.x - known.x) * lo
  const y = known.y + (other.y - known.y) * lo
  const s = known.s + (other.s - known.s) * lo
  const at = evaluate(pen, x, y, s)
  return at.inside ? [at] : []
}

export type Frame = { x0: number; y0: number; x1: number; y1: number }

/**
 * Parallel lines at `angle` (degrees) and `pitch`, optionally bent by the form: where a
 * shape swells, the lines passing over it are pushed sideways in proportion to its height,
 * so they bulge across it the way a banknote portrait's do.
 */
export function straightScreen(
  pen: Pen,
  box: Frame,
  angle: number,
  pitch: number,
  displace: number,
  path: string,
  tally: Tally,
): string {
  const a = (angle * Math.PI) / 180
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const nx = -dy
  const ny = dx
  const corners = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
  ]
  let kMin = Infinity
  let kMax = -Infinity
  let sMin = Infinity
  let sMax = -Infinity
  for (const [x, y] of corners) {
    const k = x * nx + y * ny
    const s = x * dx + y * dy
    kMin = Math.min(kMin, k)
    kMax = Math.max(kMax, k)
    sMin = Math.min(sMin, s)
    sMax = Math.max(sMax, s)
  }
  const first = Math.ceil(kMin / pitch)
  const last = Math.floor(kMax / pitch)
  const st = pen.step
  const count = Math.ceil((sMax - sMin) / st) + 1
  for (let k = first; k <= last; k++) {
    const off = k * pitch
    const pts: number[] = []
    const arc: number[] = []
    for (let i = 0; i < count; i++) {
      const s = sMin + i * st
      let x = dx * s + nx * off
      let y = dy * s + ny * off
      let shift = 0
      if (displace > 0) {
        const own = ownerAt(pen.field, x, y)
        if (own >= 0 && pen.shapes.has(own)) {
          const sh = pen.field.shapes[own]
          if (sh.bevel > 0) {
            const u = Math.min(1, Math.max(0, sd(sh, x, y) / (sh.bevel * 1.6)))
            shift += displace * sh.relief * Math.sqrt(1 - (1 - u) * (1 - u))
          }
        }
      }
      if (pen.waver > 0) shift += pen.waver * (valueNoise(s * 0.22, k * 0.9 + 7, pen.seed) - 0.5) * 2
      x += nx * shift
      y += ny * shift
      pts.push(x, y)
      arc.push(s)
    }
    path = trace(pen, pts, arc, path, tally)
  }
  return path
}

/** Iso-lines of the distance to each shape's edge: lines that follow the form. */
export function contourScreen(pen: Pen, pitch: number, path: string, tally: Tally): string {
  for (const index of pen.shapes) {
    const shape = pen.field.shapes[index]
    const inner = Math.max(...shape.grid.data)
    for (let level = pitch * 0.55; level < inner; level += pitch) {
      for (const line of contourLines(shape.grid, level)) {
        const smoothed = chaikin(chaikin(line.points, line.closed), line.closed)
        const { pts, s } = resample(smoothed, line.closed, pen.step)
        if (pen.waver > 0) {
          for (let i = 0; i < s.length; i++) {
            const j = Math.min(s.length - 1, i + 1)
            const h = Math.max(0, i - 1)
            const tx = pts[j * 2] - pts[h * 2]
            const ty = pts[j * 2 + 1] - pts[h * 2 + 1]
            const len = Math.hypot(tx, ty) || 1
            const w = pen.waver * (valueNoise(s[i] * 0.22, level * 0.7 + 3, pen.seed) - 0.5) * 2
            pts[i * 2] += (-ty / len) * w
            pts[i * 2 + 1] += (tx / len) * w
          }
        }
        path = trace(pen, pts, s, path, tally)
      }
    }
  }
  return path
}

/**
 * The visible part of a shape's outline, as polylines: the stretches of its edge that no
 * shape drawn over it covers. Returned as flat point lists with whether the loop closed.
 */
export function visibleEdges(field: Field, index: number, step: number): { points: number[]; closed: boolean }[] {
  const shape = field.shapes[index]
  const poly = shape.poly
  const pts = resample([...poly, poly[0], poly[1]], false, step).pts
  const hidden = (x: number, y: number) => {
    for (let k = index + 1; k < field.shapes.length; k++) {
      const o = field.shapes[k]
      if (sd(o, x, y) > 0.05) return true
    }
    return false
  }
  const m = pts.length / 2
  const vis: boolean[] = []
  for (let i = 0; i < m; i++) vis.push(!hidden(pts[i * 2], pts[i * 2 + 1]))
  const out: { points: number[]; closed: boolean }[] = []
  if (vis.every(Boolean)) {
    out.push({ points: pts.slice(0, -2), closed: true })
    return out
  }
  // Start at a hidden point so that no visible run wraps round the seam.
  const start = vis.indexOf(false)
  let cur: number[] = []
  for (let c = 1; c <= m; c++) {
    const i = (start + c) % m
    if (vis[i]) cur.push(pts[i * 2], pts[i * 2 + 1])
    else if (cur.length) {
      out.push({ points: cur, closed: false })
      cur = []
    }
  }
  if (cur.length) out.push({ points: cur, closed: false })
  return out.filter((e) => e.points.length >= 4).map((e) => ({ points: simplify(e.points, 0.02), closed: false }))
}
