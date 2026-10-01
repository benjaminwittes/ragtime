/**
 * Plane geometry for the engraved style: path strings flattened to polygons, and the
 * inside and distance tests the tone field is built from. No DOM, no React, nothing from
 * the rest of the app, so all of it runs in a node test.
 *
 * A polygon is a flat `number[]` — `[x0, y0, x1, y1, …]`, closed implicitly — because the
 * field builder walks millions of these and an array of pairs would allocate for each.
 */

export type Poly = readonly number[]

export type Box = { x0: number; y0: number; x1: number; y1: number }

const QUAD_STEPS = 10
const CUBIC_STEPS = 12

/**
 * Flatten an SVG path string to polygons, one per subpath. Absolute `M L H V Q C Z` only,
 * which is every command the owl's poses use; anything else is skipped rather than
 * guessed at, so a pose that starts using arcs fails the tests that pin the outline.
 */
export function flattenPath(d: string): number[][] {
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []
  const out: number[][] = []
  let current: number[] = []
  let x = 0
  let y = 0
  let i = 0
  const num = () => Number(tokens[i++])
  let cmd = ''
  while (i < tokens.length) {
    const token = tokens[i]
    if (/^[A-Za-z]$/.test(token)) {
      cmd = token.toUpperCase()
      i++
      if (cmd === 'Z') {
        if (current.length >= 6) out.push(current)
        current = []
        continue
      }
    }
    switch (cmd) {
      case 'M':
        if (current.length >= 6) out.push(current)
        current = []
        x = num()
        y = num()
        current.push(x, y)
        cmd = 'L'
        break
      case 'L':
        x = num()
        y = num()
        current.push(x, y)
        break
      case 'H':
        x = num()
        current.push(x, y)
        break
      case 'V':
        y = num()
        current.push(x, y)
        break
      case 'Q': {
        const cx = num()
        const cy = num()
        const ex = num()
        const ey = num()
        for (let s = 1; s <= QUAD_STEPS; s++) {
          const t = s / QUAD_STEPS
          const u = 1 - t
          current.push(u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey)
        }
        x = ex
        y = ey
        break
      }
      case 'C': {
        const c1x = num()
        const c1y = num()
        const c2x = num()
        const c2y = num()
        const ex = num()
        const ey = num()
        for (let s = 1; s <= CUBIC_STEPS; s++) {
          const t = s / CUBIC_STEPS
          const u = 1 - t
          current.push(
            u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
            u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
          )
        }
        x = ex
        y = ey
        break
      }
      default:
        i++
    }
  }
  if (current.length >= 6) out.push(current)
  return out
}

/** `"50,43 47.5,47.5 52.5,47.5"`, as a `<polygon points>` attribute holds it. */
export function polygonFromPoints(points: string): number[] {
  return (points.match(/-?\d*\.?\d+/g) ?? []).map(Number)
}

export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, steps?: number): number[] {
  const n = steps ?? Math.max(32, Math.min(96, Math.round(Math.max(rx, ry) * 4)))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return out
}

/** A rectangle with rounded corners, as the books and the lantern frame are drawn. */
export function rectPoly(x: number, y: number, w: number, h: number, r = 0): number[] {
  const rad = Math.min(r, w / 2, h / 2)
  if (rad <= 0) return [x, y, x + w, y, x + w, y + h, x, y + h]
  const out: number[] = []
  const corner = (cx: number, cy: number, from: number) => {
    for (let s = 0; s <= 4; s++) {
      const a = from + (s / 4) * (Math.PI / 2)
      out.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
    }
  }
  corner(x + w - rad, y + rad, -Math.PI / 2)
  corner(x + w - rad, y + h - rad, 0)
  corner(x + rad, y + h - rad, Math.PI / 2)
  corner(x + rad, y + rad, Math.PI)
  return out
}

export function polyBox(poly: Poly): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < poly.length; i += 2) {
    if (poly[i] < x0) x0 = poly[i]
    if (poly[i] > x1) x1 = poly[i]
    if (poly[i + 1] < y0) y0 = poly[i + 1]
    if (poly[i + 1] > y1) y1 = poly[i + 1]
  }
  return { x0, y0, x1, y1 }
}

/** Even-odd inside test. */
export function insidePoly(x: number, y: number, poly: Poly): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const yi = poly[i + 1]
    const yj = poly[j + 1]
    if (yi > y !== yj > y && x < ((poly[j] - poly[i]) * (y - yi)) / (yj - yi) + poly[i]) inside = !inside
  }
  return inside
}

/** Distance from a point to the nearest edge of the polygon. */
export function edgeDistance(x: number, y: number, poly: Poly): number {
  let best = Infinity
  const n = poly.length
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = poly[j]
    const ay = poly[j + 1]
    const dx = poly[i] - ax
    const dy = poly[i + 1] - ay
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const px = ax + t * dx - x
    const py = ay + t * dy - y
    const d2 = px * px + py * py
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

/** Ramer–Douglas–Peucker on a flat polyline; endpoints are kept. */
export function simplify(points: readonly number[], epsilon: number): number[] {
  const n = points.length / 2
  if (n <= 2 || epsilon <= 0) return points.slice()
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: number[] = [0, n - 1]
  const e2 = epsilon * epsilon
  while (stack.length) {
    const b = stack.pop() as number
    const a = stack.pop() as number
    if (b - a < 2) continue
    const ax = points[a * 2]
    const ay = points[a * 2 + 1]
    const dx = points[b * 2] - ax
    const dy = points[b * 2 + 1] - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let at = -1
    for (let k = a + 1; k < b; k++) {
      const px = points[k * 2] - ax
      const py = points[k * 2 + 1] - ay
      let d2: number
      if (len2 === 0) d2 = px * px + py * py
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
        const qx = px - t * dx
        const qy = py - t * dy
        d2 = qx * qx + qy * qy
      }
      if (d2 > worst) {
        worst = d2
        at = k
      }
    }
    if (worst > e2) {
      keep[at] = 1
      stack.push(a, at, at, b)
    }
  }
  const out: number[] = []
  for (let k = 0; k < n; k++) if (keep[k]) out.push(points[k * 2], points[k * 2 + 1])
  return out
}
