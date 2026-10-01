import type { OwlDesign, PoseGeometry } from '../../types'
import { buildField, type Field, type ToneParams } from './field'
import type { EngravedParams } from './params'
import { appendPolyline } from './ribbon'
import { contourScreen, straightScreen, visibleEdges, type Frame, type Pen, type Tally } from './screens'
import { poseShapes, REGIONS, regionShapes, shapeBases } from './shapes'

/**
 * The plate: everything the engraved style draws, as path data grouped by region.
 *
 * This is the pure core. It takes a pose's geometry, the palette's tones and the
 * parameters, and returns strings; nothing here touches the DOM, so it is tested in node
 * and could as easily run in a worker. The one expensive step (a distance grid per shape)
 * is cached per pose; the plate itself is cached on everything that can change it, so a
 * hundred owls of one kind cost one plate, and dragging a knob costs one rebuild.
 */

export type PlateGroup = {
  /** The region's id; the group's class is `eng-<id>`. */
  id: string
  lantern: boolean
  /** The main screen, as one path of ribbon polygons. */
  screen: string
  /** The cross-hatch, if it printed anything. */
  hatch: string
  /** The keyline, as open polylines to be stroked, and the width to stroke them at. */
  key: string
  keyWidth: number
}

export type Plate = {
  groups: PlateGroup[]
  ground: EngravedParams['ground']
  /** The parameters actually drawn, after the small-figure adjustments. */
  effective: EngravedParams
  /** How much coarser than asked the screen had to be: 1 is not at all. */
  coarsening: number
  stats: { bytes: number; ribbons: number; points: number; ms: number }
}

export type PlateInput = {
  pose: PoseGeometry
  shape: OwlDesign['shape']
  palette: OwlDesign['palette']
  params: EngravedParams
  /** Device pixels across the figure. 0 when it is not known. */
  px: number
}

const STEP = { draft: 0.6, normal: 0.35, fine: 0.22 } as const
const EPS = { draft: 0.06, normal: 0.035, fine: 0.02 } as const

/** The figure is 100 units across; a screen finer than `minPitchPx` device pixels is mush. */
export function adaptParams(params: EngravedParams, px: number): { params: EngravedParams; coarsening: number } {
  if (!params.adapt) return { params, coarsening: 1 }
  const u = Math.max(px, 24) / 100
  const floor = params.minPitchPx / u
  const coarsening = Math.max(1, floor / params.pitch)
  const next = { ...params }
  next.pitch = Math.max(params.pitch, floor)
  next.contourPitch = Math.max(params.contourPitch, floor)
  next.wmin = Math.max(params.wmin, 0.55 / u)
  next.keyline = params.keyline > 0 ? Math.max(params.keyline, 1 / u) : 0
  next.displace = params.displace / Math.sqrt(coarsening)
  if (coarsening > 1.12) next.hatch = 1
  if (coarsening > 1.02) next.breakAt = 0
  if (coarsening > 1.3) {
    next.waver = 0
    next.grain = 0
  }
  return { params: next, coarsening }
}

const fields = new Map<string, Field>()

function fieldFor(pose: PoseGeometry, shape: OwlDesign['shape'], ground: boolean): Field {
  const key = JSON.stringify([pose, shape.disc, shape.bookHeight, shape.bookRadius, shape.lanternRadius, ground])
  let field = fields.get(key)
  if (!field) {
    field = buildField(poseShapes(pose, shape, ground))
    fields.set(key, field)
    if (fields.size > 6) fields.delete(fields.keys().next().value as string)
  }
  return field
}

const plates = new Map<string, Plate>()

export function buildPlate(input: PlateInput): Plate {
  const px = input.px > 0 ? input.px : 320
  const adapted = adaptParams(input.params, px)
  const key = JSON.stringify([input.pose, input.shape, input.palette, adapted.params])
  const hit = plates.get(key)
  if (hit) return hit
  const t0 = typeof performance === 'undefined' ? Date.now() : performance.now()
  const plate = draw(input, adapted.params, adapted.coarsening, px)
  plate.stats.ms = (typeof performance === 'undefined' ? Date.now() : performance.now()) - t0
  plates.set(key, plate)
  if (plates.size > 40) plates.delete(plates.keys().next().value as string)
  return plate
}

function draw(input: PlateInput, p: EngravedParams, coarsening: number, px: number): Plate {
  const hasGround = p.ground !== 'none'
  const field = fieldFor(input.pose, input.shape, hasGround)
  const rad = (p.light * Math.PI) / 180
  const tone: ToneParams = {
    bases: shapeBases(field.shapes, input.palette, p.ground),
    gamma: p.gamma,
    contrast: p.contrast,
    brightness: p.brightness,
    lightX: Math.cos(rad),
    lightY: Math.sin(rad),
    model: p.model,
    edge: p.edge,
    shadow: p.shadow,
    grain: p.grain,
    seed: p.seed,
  }
  const step = Math.max(STEP[p.fidelity], 0.3 / (px / 100))
  const eps = Math.max(EPS[p.fidelity], 0.2 / (px / 100))
  const tally: Tally = { ribbons: 0, points: 0 }
  const groups: PlateGroup[] = []

  for (const region of REGIONS) {
    const indices = regionShapes(region, field.byId)
    if (indices.length === 0) continue
    const lines = !region.open && (region.id !== 'ground' || p.ground === 'tint')
    const follow = p.screen === 'contour' || (p.screen === 'mixed' && region.follow)
    const pitch = (follow ? p.contourPitch : p.pitch) * region.pitch
    const base: Pen = {
      field,
      tone,
      shapes: new Set(indices),
      bias: region.bias,
      step,
      eps,
      wmin: p.wmin,
      wcap: Math.max(p.wmin, p.wmax * pitch),
      floor: p.floor,
      breakAt: region.plain ? 0 : p.breakAt,
      dash: p.dash,
      gate: 0,
      weight: 1,
      waver: p.waver,
      seed: p.seed,
      gamma: p.gamma,
      contrast: p.contrast,
      brightness: p.brightness,
    }
    const box: Frame = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (const i of indices) {
      const b = field.shapes[i].box
      box.x0 = Math.min(box.x0, b.x0)
      box.y0 = Math.min(box.y0, b.y0)
      box.x1 = Math.max(box.x1, b.x1)
      box.y1 = Math.max(box.y1, b.y1)
    }
    const angle = p.angle + region.angle * p.fan
    let screen = ''
    let hatch = ''
    if (lines) {
      screen = follow
        ? contourScreen(base, pitch, '', tally)
        : straightScreen(base, box, angle, pitch, p.screen === 'displaced' ? p.displace : 0, '', tally)
      if (p.hatch < 1 && !region.plain) {
        const cross: Pen = { ...base, gate: p.hatch, weight: p.hatchWeight, breakAt: 0, waver: 0 }
        hatch = straightScreen(cross, box, angle + p.hatchAngle, pitch, 0, '', tally)
      }
    }
    let keyPath = ''
    const keyWidth = p.keyline * region.key
    if (keyWidth > 0) {
      for (const i of indices) {
        for (const e of visibleEdges(field, i, 0.35)) keyPath = appendPolyline(keyPath, e.points, e.closed)
      }
    }
    groups.push({ id: region.id, lantern: region.lantern === true, screen, hatch, key: keyPath, keyWidth })
  }

  let bytes = 0
  for (const g of groups) bytes += g.screen.length + g.hatch.length + g.key.length
  return {
    groups,
    ground: p.ground,
    effective: p,
    coarsening,
    stats: { bytes, ribbons: tally.ribbons, points: tally.points, ms: 0 },
  }
}
