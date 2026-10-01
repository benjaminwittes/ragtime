import { simplify } from './geometry'

/**
 * Path data for variable-width lines, as compactly as SVG will take it.
 *
 * A line whose weight carries tone is a ribbon — a polygon, not a stroke — so a plate is
 * thousands of them. Each outline goes out as one absolute `M` and then relative `l`
 * steps on a 0.02-unit lattice, written without leading zeros or needless separators.
 * That roughly halves the bytes of the obvious `L x,y` form, and the lattice is finer
 * than a pixel at any size the owl is drawn.
 */

const LATTICE = 50

/** An integer count of lattice steps as the shortest SVG number: `7` → `.14`, `-75` → `-1.5`. */
function fmt(steps: number): string {
  if (steps === 0) return '0'
  const abs = Math.abs(steps)
  let s = (abs / LATTICE).toFixed(2)
  if (s.endsWith('0')) s = s.slice(0, -1)
  if (s.endsWith('0')) s = s.slice(0, -2) // "1.00" → "1"
  if (s.startsWith('0.')) s = s.slice(1)
  return steps < 0 ? '-' + s : s
}

/** A path under construction; it remembers whether its last number carries a decimal point. */
type Writer = { s: string; dot: boolean }

/** Append a number, inserting a space only where two numbers would otherwise fuse. */
function push(w: Writer, token: string): void {
  const c = token.charCodeAt(0)
  const hasDot = token.includes('.')
  if (c === 45) {
    // '-' separates by itself.
  } else {
    const last = w.s.charCodeAt(w.s.length - 1)
    const lastIsDigit = (last >= 48 && last <= 57) || last === 46
    if (lastIsDigit && !(c === 46 && w.dot)) w.s += ' '
  }
  w.s += token
  w.dot = hasDot
}

function appendPoints(path: string, pts: readonly number[], close: boolean): string {
  const n = pts.length / 2
  if (n < 2) return path
  let x = Math.round(pts[0] * LATTICE)
  let y = Math.round(pts[1] * LATTICE)
  const w: Writer = { s: path + 'M', dot: false }
  push(w, fmt(x))
  push(w, fmt(y))
  w.s += 'l'
  w.dot = false
  let steps = 0
  for (let i = 1; i < n; i++) {
    const nx = Math.round(pts[i * 2] * LATTICE)
    const ny = Math.round(pts[i * 2 + 1] * LATTICE)
    if (nx === x && ny === y) continue
    push(w, fmt(nx - x))
    push(w, fmt(ny - y))
    x = nx
    y = ny
    steps++
  }
  // An outline that collapsed onto the lattice is nothing, and `l` with no numbers is an error.
  if (steps < (close ? 2 : 1)) return path
  return close ? w.s + 'z' : w.s
}

/** One closed outline, given as absolute points, appended to `path` as `M…l…z`. */
export function appendOutline(path: string, pts: readonly number[]): string {
  return pts.length < 6 ? path : appendPoints(path, pts, true)
}

/** An open polyline, for the keylines that are stroked rather than filled. */
export function appendPolyline(path: string, pts: readonly number[], close: boolean): string {
  return appendPoints(path, pts, close)
}

/**
 * The outline of a ribbon along `pts` (flat x, y) whose full width at point i is `widths[i]`.
 * The two edges are simplified separately, so a stretch where the weight does not change
 * is two straight edges and a gently swelling one is a few vertices.
 */
export function ribbonOutline(
  pts: readonly number[],
  widths: readonly number[],
  epsilon: number,
): number[] {
  const n = widths.length
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    let tx = pts[b * 2] - pts[a * 2]
    let ty = pts[b * 2 + 1] - pts[a * 2 + 1]
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const h = widths[i] / 2
    const x = pts[i * 2]
    const y = pts[i * 2 + 1]
    left.push(x - ty * h, y + tx * h)
    right.push(x + ty * h, y - tx * h)
  }
  const l = simplify(left, epsilon)
  const r = simplify(right, epsilon)
  const out = l.slice()
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1])
  return out
}
