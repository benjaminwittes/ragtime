/**
 * The line-tile engine (a lab spike, nothing ships it).
 *
 * An image is drawn as a mosaic of small tiles of parallel horizontal lines. Within a tile
 * the lines thicken and thin together (`lock`), so a tile is one grey, and the sum of the
 * tiles is the picture, the way a halftone is. Unlike a halftone the ink is not cut into
 * cells: each line is one continuous ribbon whose thickness is smoothed along its length,
 * and beaded the way ink on a surface beads, so a swell stretches, the run next to it
 * pinches, and where two neighbouring lines grow into each other they merge.
 *
 * All of it is plain arithmetic on a `field(x, y) -> ink density 0..1` function in the
 * 100 by 100 units the owl is drawn in, and the result is one SVG path string. No DOM.
 */

export type Field = (x: number, y: number) => number

export type LineParams = {
  /** The side of the drawing on screen, in px; units are 1/100 of it. */
  size: number
  /** Lines in one tile; the line count is rounded to a whole number of tiles. */
  lines: number
  /** Distance between line centres, on screen, in px. */
  pitchPx: number
  /** Tile width, in line pitches: how far a swell is smoothed along its line. */
  tile: number
  /** 0 = every line follows the picture on its own; 1 = a tile's lines are one grey. */
  lock: number
  /** How much a swell pinches the ink beside it (0 = a plain blur). */
  bead: number
  /** Narrowest and widest a line gets, as a fraction of the pitch. Above 1 two lines merge. */
  minW: number
  maxW: number
  /** Tone curve: above 1 lights the mid greys, below 1 darkens them. */
  gamma: number
  /** How far a line leans toward a thicker neighbour, in pitches per unit of difference. */
  bulge: number
  /** Gaps narrower than this, on screen, close: the ink merges instead of leaving a sliver. */
  snapPx: number
  /** The region lines are drawn in, in units. */
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 0 below `a`, 1 above `b`, smooth between (works either way round). */
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** A normalised gaussian over whole samples; sigma is in samples. */
export function gaussKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2.6))
  const k = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    k[i + radius] = v
    sum += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return k
}

/** Convolve one row in place-free: `n` samples from `src[off]` into `out[off]`, edges held. */
export function smoothRow(src: Float32Array, out: Float32Array, off: number, n: number, kernel: Float32Array) {
  const r = (kernel.length - 1) / 2
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let j = -r; j <= r; j++) {
      const at = i + j < 0 ? 0 : i + j >= n ? n - 1 : i + j
      acc += src[off + at] * kernel[j + r]
    }
    out[off + i] = acc
  }
}

const r2 = (v: number) => Math.round(v * 50) / 50

/** The widths of one column of lines that would leave a sliver of paper, closed. Pure. */
export function snapGaps(widths: readonly number[], snapFrac: number): number[] {
  const add = new Array<number>(widths.length).fill(0)
  for (let k = 0; k + 1 < widths.length; k++) {
    const gap = 1 - (widths[k] + widths[k + 1]) / 2
    // Only ink that is really there: two hairlines a pitch apart are not a sliver.
    if (gap <= 0 || gap >= snapFrac || Math.min(widths[k], widths[k + 1]) < 0.35) continue
    const a = gap * smoothstep(1, 0.4, gap / snapFrac)
    add[k] = Math.max(add[k], a)
    add[k + 1] = Math.max(add[k + 1], a)
  }
  return widths.map((w, k) => w + add[k])
}

export type LineStats = { lines: number; steps: number; points: number }

/** Draw `field` as five-line tiles: one SVG path (`d`) and what it cost. */
export function computeLines(field: Field, p: LineParams): { d: string; stats: LineStats } {
  const { x0, y0, x1, y1 } = p.bounds
  const L = Math.max(1, Math.round(p.lines))
  const unitPx = p.size / 100
  const want = (y1 - y0) / ((p.pitchPx / unitPx) || 1)
  const n = Math.max(L, Math.round(want / L) * L)
  const pitch = (y1 - y0) / n
  const pitchPx = pitch * unitPx
  const step = Math.max(0.35, Math.min(pitch * 0.55, 1.4))
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1)

  // 1. The picture, sampled on each line.
  const d = new Float32Array(n * nx)
  for (let k = 0; k < n; k++) {
    const y = y0 + (k + 0.5) * pitch
    for (let i = 0; i < nx; i++) d[k * nx + i] = field(x0 + i * step, y)
  }
  // 2. A tile's lines go to the tile's mean, as far as `lock` says.
  if (p.lock > 0 && L > 1) {
    for (let g = 0; g < n; g += L) {
      for (let i = 0; i < nx; i++) {
        let mean = 0
        for (let k = g; k < g + L; k++) mean += d[k * nx + i]
        mean /= L
        for (let k = g; k < g + L; k++) d[k * nx + i] += (mean - d[k * nx + i]) * p.lock
      }
    }
  }
  // 3. Smooth along the line: this is what makes a swell a swell and not a step.
  const sigma = Math.max(0.5, (p.tile * pitch * 0.2) / step)
  const near = gaussKernel(sigma)
  const wide = gaussKernel(sigma * 2.4)
  const a = new Float32Array(n * nx)
  const b = new Float32Array(n * nx)
  for (let k = 0; k < n; k++) smoothRow(d, a, k * nx, nx, near)
  for (let k = 0; k < n; k++) smoothRow(a, b, k * nx, nx, wide)
  // 4. Tone to thickness, then bead: take away what the wider neighbourhood holds, so a
  // swell is flanked by a pinch.
  const w = new Float32Array(n * nx)
  for (let j = 0; j < n * nx; j++) {
    const tone = Math.pow(clamp01(a[j]), p.gamma)
    let v = p.minW + (p.maxW - p.minW) * tone
    const around = p.minW + (p.maxW - p.minW) * Math.pow(clamp01(b[j]), p.gamma)
    v += p.bead * (v - around)
    v = Math.min(p.maxW, Math.max(0, v))
    // Ink thinner than a fraction of a pixel does not print; let it go out, not grey.
    w[j] = v * smoothstep(0.12, 0.6, v * pitchPx)
  }
  // 5. Gaps too thin to see close up, column by column.
  const snapFrac = p.snapPx / pitchPx
  if (snapFrac > 0) {
    const col = new Array<number>(n)
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < n; k++) col[k] = w[k * nx + i]
      const out = snapGaps(col, snapFrac)
      for (let k = 0; k < n; k++) w[k * nx + i] = out[k]
    }
  }
  // 6. Ribbons. A line leans toward a thicker neighbour; ink runs, with their own ends.
  let out = ''
  let points = 0
  const ys = new Float32Array(nx)
  const hs = new Float32Array(nx)
  for (let k = 0; k < n; k++) {
    const y = y0 + (k + 0.5) * pitch
    for (let i = 0; i < nx; i++) {
      const up = k > 0 ? w[(k - 1) * nx + i] : 0
      const dn = k + 1 < n ? w[(k + 1) * nx + i] : 0
      ys[i] = y + p.bulge * 0.25 * (dn - up) * pitch
      hs[i] = (w[k * nx + i] * pitch) / 2
    }
    let i = 0
    while (i < nx) {
      while (i < nx && hs[i] < 0.004) i++
      if (i >= nx) break
      let j = i
      while (j < nx && hs[j] >= 0.004) j++
      const s = Math.max(0, i - 1)
      const e = Math.min(nx - 1, j)
      out += 'M' + r2(x0 + s * step) + ' ' + r2(ys[s] - hs[s])
      for (let m = s + 1; m <= e; m++) out += 'L' + r2(x0 + m * step) + ' ' + r2(ys[m] - hs[m])
      for (let m = e; m >= s; m--) out += 'L' + r2(x0 + m * step) + ' ' + r2(ys[m] + hs[m])
      out += 'Z'
      points += (e - s + 1) * 2
      i = j
    }
  }
  return { d: out, stats: { lines: n, steps: nx, points } }
}

/**
 * Per-size defaults: a few lines at the small sizes, and a coarser pitch, because below
 * about two pixels a gap between two lines is a grey, not a gap.
 */
export function presetFor(size: number): Pick<LineParams, 'lines' | 'pitchPx' | 'tile'> {
  if (size <= 56) return { lines: 3, pitchPx: 2.3, tile: 3.4 }
  if (size <= 80) return { lines: 4, pitchPx: 2.7, tile: 3.6 }
  if (size <= 112) return { lines: 5, pitchPx: 2.9, tile: 3.8 }
  return { lines: 5, pitchPx: 3.4, tile: 4.2 }
}

export const DEFAULT_LINE_STYLE = {
  lock: 0.5,
  bead: 0.6,
  minW: 0,
  maxW: 1.08,
  gamma: 1.6,
  bulge: 0.5,
  snapPx: 0.9,
}

/* ---- time ---------------------------------------------------------------- */

/** How open the eye is at time `t` seconds: one quick blink every `period`. 1 open, 0.06 shut. */
export function eyeOpen(t: number, period = 5.5, shut = 0.22): number {
  const phase = (((t % period) + period) % period) / period
  const half = shut / period / 2
  const dist = Math.abs(phase - 0.78) / half
  return dist >= 1 ? 1 : 0.06 + 0.94 * smoothstep(0, 1, dist)
}

/** A glow strength at time `t`: steady and breathing when lit, a pulse that comes and goes when searching, none when dark. */
export function glowAt(t: number, state: 'lit' | 'searching' | 'dark'): number {
  if (state === 'dark') return 0
  if (state === 'lit') return 0.9 + 0.1 * Math.sin(t * 1.7)
  const s = 0.5 + 0.5 * Math.sin(t * 2.6)
  return 0.35 + 0.75 * s * s
}
