import type { OwlDesign, PaletteKey, PoseGeometry } from '../../types'
import { ellipsePoly, flattenPath, polygonFromPoints, rectPoly, type Poly } from './geometry'
import type { ShapeDef } from './field'

/**
 * What the owl is made of, as the engraver sees it: a stack of shapes, each with the ink
 * density of the colour it is drawn in flat, and the regions those shapes are printed in.
 *
 * The regions are data. A region says which shapes it prints, and how its screen departs
 * from the plate's: its own angle (as an offset from the plate's, so the angle knob still
 * turns the whole plate), its own spacing, a push on the tone, and what it does under the
 * mixed screen. The names are the class names of the groups in the output (`eng-body`,
 * `eng-wing-l`), which is the hook a standing animation takes hold of.
 */

/** Relative luminance of a `#rgb` or `#rrggbb` colour, or `null` for anything else (a `var()`, a name). */
export function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const v = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

/** The ink density a flat colour stands for: dark is heavy, paper is nothing. */
export function inkOf(color: string): number {
  const l = luminance(color)
  return l === null ? 0.5 : Math.min(1, Math.max(0, 1 - l))
}

type ShapeSpec = {
  id: string
  from: PaletteKey
  poly: Poly
  bevel: number
  relief: number
  rim?: number
}

/** The shapes of one pose, bottom to top — the order the owl's concept sheet paints them in. */
export function poseShapes(
  pose: PoseGeometry,
  shape: OwlDesign['shape'],
  ground: boolean,
): ShapeDef[] {
  const specs: ShapeSpec[] = []
  if (ground) {
    specs.push({ id: 'ground', from: 'cream', poly: ellipsePoly(50, 50, shape.disc, shape.disc, 72), bevel: 24, relief: 0, rim: 1.6 })
  }
  pose.books.forEach((b, i) => {
    specs.push({
      id: 'book' + i,
      from: 'page',
      poly: rectPoly(b.x, b.y, b.width, shape.bookHeight, shape.bookRadius),
      bevel: 2.2,
      relief: 0.5,
    })
  })
  specs.push({ id: 'body', from: 'navy', poly: flattenPath(pose.body)[0], bevel: 13, relief: 1 })
  specs.push({ id: 'head', from: 'navy', poly: flattenPath(pose.head)[0], bevel: 7, relief: 1 })
  specs.push({
    id: 'face',
    from: 'slate',
    poly: ellipsePoly(50, pose.face.cy, pose.face.r, pose.face.r, 72),
    bevel: pose.face.r,
    relief: 1,
  })
  specs.push({
    id: 'belly',
    from: 'tan',
    poly: ellipsePoly(50, pose.belly.cy, pose.belly.rx, pose.belly.ry, 64),
    bevel: pose.belly.rx,
    relief: 1,
  })
  pose.wings.forEach((w, i) => {
    specs.push({
      id: i === 0 ? 'wingL' : 'wingR',
      from: 'wing',
      poly: ellipsePoly(w.cx, w.cy, w.rx, w.ry, 48),
      bevel: w.rx,
      relief: 1,
    })
  })
  specs.push({ id: 'beak', from: 'gold', poly: polygonFromPoints(pose.beak), bevel: 1.2, relief: 0.6 })
  const { frame, flame } = pose.lantern
  specs.push({
    id: 'frame',
    from: 'navy',
    poly: rectPoly(frame.x, frame.y, frame.width, frame.height, shape.lanternRadius),
    bevel: 2,
    relief: 0.5,
  })
  specs.push({
    id: 'flame',
    from: 'flame',
    poly: rectPoly(flame.x, flame.y, flame.width, flame.height),
    bevel: 0,
    relief: 0,
  })
  return specs.map((s) => ({ id: s.id, poly: s.poly, from: s.from, bevel: s.bevel, relief: s.relief, rim: s.rim }))
}

/** The base tone of each shape: its flat colour's ink density; the ground is paper or a light tint. */
export function shapeBases(
  shapes: readonly ShapeDef[],
  palette: OwlDesign['palette'],
  ground: 'none' | 'paper' | 'tint',
): number[] {
  return shapes.map((s) => (s.id === 'ground' ? (ground === 'tint' ? 0.05 : 0) : inkOf(palette[s.from as PaletteKey])))
}

export type Region = {
  /** The group's class: `eng-<id>`. */
  id: string
  /** Shape ids this region prints. `book*` stands for every book. */
  shapes: readonly string[]
  /** Degrees added to the plate's angle, scaled by `fan`. */
  angle: number
  /** Multiplier on the plate's line spacing. */
  pitch: number
  /** Added to the tone before the curve. */
  bias: number
  /** Under the mixed screen: lines that follow the form, rather than straight ones. */
  follow: boolean
  /** Weight of the keyline round this region's visible edge, as a share of the plate's. */
  key: number
  /** No lines at all, only the keyline. */
  open?: boolean
  /** Plain lines: no break-up into dashes, no cross-hatch. */
  plain?: boolean
  /** Whether this region is drawn in the lantern layer, over the glow. */
  lantern?: boolean
}

/**
 * Printed in this order; each has the plate's angle plus its own. The body runs with the
 * plate, the head leans off it, the face and belly run across it, and the two wings
 * mirror each other — which is most of what separates feathers from fur.
 */
export const REGIONS: readonly Region[] = [
  { id: 'ground', shapes: ['ground'], angle: 55, pitch: 1.6, bias: 0, follow: false, key: 0.8, plain: true },
  { id: 'books', shapes: ['book*'], angle: -90, pitch: 1, bias: 0, follow: false, key: 1 },
  { id: 'body', shapes: ['body'], angle: 0, pitch: 1, bias: 0, follow: true, key: 1 },
  { id: 'head', shapes: ['head'], angle: -22, pitch: 0.9, bias: 0, follow: true, key: 1 },
  { id: 'face', shapes: ['face'], angle: -90, pitch: 0.8, bias: 0, follow: true, key: 0.7 },
  { id: 'belly', shapes: ['belly'], angle: -90, pitch: 0.9, bias: 0, follow: true, key: 0.6 },
  { id: 'wing-l', shapes: ['wingL'], angle: 40, pitch: 0.9, bias: 0, follow: false, key: 0.6 },
  { id: 'wing-r', shapes: ['wingR'], angle: -40, pitch: 0.9, bias: 0, follow: false, key: 0.6 },
  { id: 'beak', shapes: ['beak'], angle: -90, pitch: 0.6, bias: 0, follow: false, key: 0.9 },
  { id: 'lantern', shapes: ['frame'], angle: -90, pitch: 0.55, bias: 0, follow: false, key: 1, lantern: true },
  { id: 'flame', shapes: ['flame'], angle: 0, pitch: 1, bias: 0, follow: false, key: 1, open: true, lantern: true },
]

export function regionShapes(region: Region, ids: ReadonlyMap<string, number>): number[] {
  const out: number[] = []
  for (const want of region.shapes) {
    if (want.endsWith('*')) {
      const prefix = want.slice(0, -1)
      for (const [id, index] of ids) if (id.startsWith(prefix)) out.push(index)
    } else {
      const index = ids.get(want)
      if (index !== undefined) out.push(index)
    }
  }
  return out
}
