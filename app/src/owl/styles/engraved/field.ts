import { edgeDistance, insidePoly, polyBox, type Box, type Poly } from './geometry'

/**
 * The tone field: for any point in the 100×100 figure, which shape is on top there and
 * how dark the plate should be.
 *
 * Each shape keeps a signed distance grid (positive inside, in figure units) made once
 * from its exact outline. Everything a screen asks afterwards — who owns this point, how
 * far is it from its own edge, which way does the surface turn — is a bilinear lookup,
 * so building a screen costs a few microseconds a sample and the one expensive step, the
 * grids, is done per pose and then shared by every owl that draws it.
 */

export const GRID = 0.5
const SIZE = 100
const CELLS = SIZE / GRID
const PAD = 4

export type ShapeDef = {
  id: string
  /** The outline, in figure units. */
  poly: Poly
  /** The palette entry this shape is drawn in flat: where its base tone comes from. */
  from: string
  /** How far in from the edge the surface rolls over before it goes flat. 0 is a flat plane. */
  bevel: number
  /** How strongly the roll-over turns the light. */
  relief: number
  /** A multiplier on the edge darkening: the ground uses it to vignette. */
  rim?: number
}

export type Grid = { x0: number; y0: number; w: number; h: number; data: Float32Array }

export type Shape = ShapeDef & {
  index: number
  box: Box
  grid: Grid
  /** The shapes drawn over this one that are near enough to cast a shadow on it. */
  occluders: number[]
}

export type Field = {
  shapes: Shape[]
  byId: Map<string, number>
  owner: Int8Array
  near: Uint8Array
}

function buildGrid(poly: Poly, box: Box): Grid {
  const x0 = Math.max(0, Math.floor((box.x0 - PAD) / GRID))
  const y0 = Math.max(0, Math.floor((box.y0 - PAD) / GRID))
  const x1 = Math.min(CELLS, Math.ceil((box.x1 + PAD) / GRID))
  const y1 = Math.min(CELLS, Math.ceil((box.y1 + PAD) / GRID))
  const w = x1 - x0
  const h = y1 - y0
  const data = new Float32Array(w * h)
  for (let j = 0; j < h; j++) {
    const y = (y0 + j + 0.5) * GRID
    for (let i = 0; i < w; i++) {
      const x = (x0 + i + 0.5) * GRID
      const d = edgeDistance(x, y, poly)
      data[j * w + i] = insidePoly(x, y, poly) ? d : -d
    }
  }
  return { x0, y0, w, h, data }
}

/** Signed distance to a shape's edge at (x, y): positive inside. Far outside its grid it is the pad. */
export function sd(shape: Shape, x: number, y: number): number {
  const g = shape.grid
  const fx = x / GRID - 0.5 - g.x0
  const fy = y / GRID - 0.5 - g.y0
  if (fx < 0 || fy < 0 || fx >= g.w - 1 || fy >= g.h - 1) return -PAD
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const tx = fx - i
  const ty = fy - j
  const k = j * g.w + i
  const a = g.data[k]
  const b = g.data[k + 1]
  const c = g.data[k + g.w]
  const d = g.data[k + g.w + 1]
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
}

export function buildField(defs: readonly ShapeDef[]): Field {
  const shapes: Shape[] = defs.map((def, index) => {
    const box = polyBox(def.poly)
    return { ...def, index, box, grid: buildGrid(def.poly, box), occluders: [] }
  })
  for (const s of shapes) {
    for (const o of shapes) {
      if (o.index <= s.index) continue
      const m = 8
      if (o.box.x1 > s.box.x0 - m && o.box.x0 < s.box.x1 + m && o.box.y1 > s.box.y0 - m && o.box.y0 < s.box.y1 + m) {
        s.occluders.push(o.index)
      }
    }
  }
  const owner = new Int8Array(CELLS * CELLS).fill(-1)
  const near = new Uint8Array(CELLS * CELLS)
  for (const s of shapes) {
    const g = s.grid
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const v = g.data[j * g.w + i]
        const cell = (g.y0 + j) * CELLS + g.x0 + i
        if (v > 0) owner[cell] = s.index
        if (Math.abs(v) < GRID * 0.9) near[cell] = 1
      }
    }
  }
  return { shapes, byId: new Map(shapes.map((s) => [s.id, s.index])), owner, near }
}

/**
 * The index of the shape on top at (x, y), or -1 over bare paper. Exact: cells that no
 * outline passes close to answer from the grid, and the rest ask the polygons themselves,
 * so a screen's lines end on the true edge and not on a half-unit staircase.
 */
export function ownerAt(field: Field, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return -1
  const cell = Math.floor(y / GRID) * CELLS + Math.floor(x / GRID)
  if (!field.near[cell]) return field.owner[cell]
  const { shapes } = field
  for (let k = shapes.length - 1; k >= 0; k--) {
    const s = shapes[k]
    if (x < s.box.x0 || x > s.box.x1 || y < s.box.y0 || y > s.box.y1) continue
    if (insidePoly(x, y, s.poly)) return k
  }
  return -1
}

export type ToneParams = {
  /** Ink density of each shape's flat colour, by shape index: 0 is paper, 1 solid ink. */
  bases: readonly number[]
  gamma: number
  contrast: number
  brightness: number
  /** Unit vector toward the light, in figure coordinates (y grows downward). */
  lightX: number
  lightY: number
  model: number
  edge: number
  shadow: number
  grain: number
  seed: number
}

const ELEVATION = 0.8
const SIN_EL = Math.sin(ELEVATION)
const COS_EL = Math.cos(ELEVATION)
const SHADOW_REACH = 2.6
const SHADOW_SOFT = 1.8

/** Smooth value noise in [0, 1), a pure function of position and seed. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const a = h(xi, yi)
  const b = h(xi + 1, yi)
  const c = h(xi, yi + 1)
  const d = h(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** The ink density the plate asks for at (x, y), given the shape that owns it. 0 is paper, 1 solid. */
export function toneAt(field: Field, owner: number, x: number, y: number, p: ToneParams): number {
  const s = field.shapes[owner]
  let t = p.bases[owner]
  const d = sd(s, x, y)
  if (s.bevel > 0 && d >= 0) {
    const u = Math.min(1, d / s.bevel)
    if (u < 1) {
      const e = 0.4
      const gx = (sd(s, x + e, y) - sd(s, x - e, y)) / (2 * e)
      const gy = (sd(s, x, y + e) - sd(s, x, y - e)) / (2 * e)
      const rise = Math.min(4, (s.relief * (1 - u)) / Math.sqrt(Math.max(1 - (1 - u) * (1 - u), 0.04)))
      const nx = -rise * gx
      const ny = -rise * gy
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const lambert = (nx * p.lightX * COS_EL + ny * p.lightY * COS_EL + SIN_EL) * inv
      t -= p.model * Math.max(-0.4, Math.min(0.5, lambert - SIN_EL))
      t += p.edge * (s.rim ?? 1) * (1 - u) * (1 - u)
    }
  }
  if (p.shadow > 0 && s.occluders.length > 0) {
    const qx = x + p.lightX * SHADOW_REACH
    const qy = y + p.lightY * SHADOW_REACH
    let cast = 0
    for (const k of s.occluders) {
      const o = field.shapes[k]
      const v = 0.5 + sd(o, qx, qy) / (2 * SHADOW_SOFT)
      if (v > cast) cast = v > 1 ? 1 : v
    }
    t += p.shadow * cast
  }
  if (p.grain > 0) t += p.grain * (valueNoise(x * 0.8, y * 0.8, p.seed) - 0.5)
  return t
}

/** The tone curve: contrast about the middle, then brightness, then gamma. Clamped to [0, 1]. */
export function curve(t: number, p: Pick<ToneParams, 'gamma' | 'contrast' | 'brightness'>): number {
  let v = (t - 0.5) * p.contrast + 0.5 + p.brightness
  v = v < 0 ? 0 : v > 1 ? 1 : v
  return Math.pow(v, p.gamma)
}
