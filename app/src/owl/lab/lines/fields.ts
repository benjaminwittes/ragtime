import { baseDesign } from '../../design'
import type { OwlDesign } from '../../types'
import { clamp01, eyeOpen, glowAt, smoothstep, type Field } from './engine'

/**
 * The two pictures the line-tile engine draws (a lab spike).
 *
 *  - `owlField`: today's owl, stacks pose. The still parts (body, head, face, belly, wings,
 *    books, lantern frame) are rasterised once from the design's own paths and palette
 *    into a 48 px greyscale field. The parts that move (eyes, pupils, the lantern's flame
 *    and glow) are not in the raster: they are evaluated on top, per sample, so a blink and
 *    a swell are arithmetic and not a new image.
 *  - `lanternField`: no owl, a lantern in a field of ink.
 *
 * A field answers "how much ink here", 0 for paper and 1 for the darkest ink.
 */

export type LampState = 'lit' | 'searching' | 'dark'

const RES = 48

/** 1 - the luminance of a #rrggbb colour: how dark it prints. */
export function inkOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

let raster: { design: OwlDesign; data: Float32Array } | undefined

/** The owl's still parts as ink density, `RES` by `RES` over the 100 unit box. */
function rasterise(design: OwlDesign): Float32Array {
  if (raster?.design === design) return raster.data
  const pose = design.poses.stacks
  const { palette, shape, stroke } = design
  const canvas = document.createElement('canvas')
  canvas.width = RES
  canvas.height = RES
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = new Float32Array(RES * RES)
  if (!ctx) return data
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, RES, RES)
  ctx.scale(RES / 100, RES / 100)
  const tone = (d: number) => {
    const v = Math.round(255 * (1 - clamp01(d)))
    return `rgb(${v},${v},${v})`
  }
  for (const b of pose.books) {
    // A book is paper with a dark edge: a light fill and a line, so each reads as a slab.
    ctx.fillStyle = tone(0.5)
    ctx.fillRect(b.x, b.y, b.width, shape.bookHeight)
    ctx.strokeStyle = tone(inkOf(palette.navy) * 0.9)
    ctx.lineWidth = Math.max(stroke.book, 1.4)
    ctx.strokeRect(b.x, b.y, b.width, shape.bookHeight)
  }
  ctx.fillStyle = tone(inkOf(palette.navy))
  ctx.fill(new Path2D(pose.body))
  ctx.fill(new Path2D(pose.head))
  ctx.fillStyle = tone(inkOf(palette.slate))
  ctx.beginPath()
  ctx.arc(50, pose.face.cy, pose.face.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = tone(inkOf(palette.tan))
  ctx.beginPath()
  ctx.ellipse(50, pose.belly.cy, pose.belly.rx, pose.belly.ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = tone(inkOf(palette.wing))
  for (const w of pose.wings) {
    ctx.beginPath()
    ctx.ellipse(w.cx, w.cy, w.rx, w.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = tone(inkOf(palette.gold))
  ctx.beginPath()
  const pts = pose.beak.split(' ').map((p) => p.split(',').map(Number))
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.fill()
  const f = pose.lantern.frame
  ctx.fillStyle = tone(inkOf(palette.navy))
  ctx.fillRect(f.x, f.y, f.width, f.height)
  const img = ctx.getImageData(0, 0, RES, RES).data
  for (let i = 0; i < RES * RES; i++) data[i] = 1 - img[i * 4] / 255
  raster = { design, data }
  return data
}

function sample(data: Float32Array, x: number, y: number): number {
  const gx = Math.min(RES - 1.001, Math.max(0, (x / 100) * RES - 0.5))
  const gy = Math.min(RES - 1.001, Math.max(0, (y / 100) * RES - 0.5))
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const at = (i: number, j: number) => data[j * RES + i]
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
}

/** How much a disc of radius `r` covers a point `dist` from its middle, over a soft edge. */
const disc = (dist: number, r: number, edge = 0.7) => 1 - smoothstep(r - edge, r + edge, dist)

/** The owl at time `t` in a lantern state. */
export function owlField(t: number, state: LampState, design: OwlDesign = baseDesign()): Field {
  const data = rasterise(design)
  const { eyes, lantern } = design.poses.stacks
  const { palette, shape } = design
  const open = eyeOpen(t)
  const lens = inkOf(palette.lens)
  const pupil = inkOf(palette.pupil)
  const flame = { x: lantern.flame.x + lantern.flame.width / 2, y: lantern.flame.y + lantern.flame.height / 2 }
  const glow = glowAt(t, state)
  const sweep = state === 'searching' ? Math.sin(t * 1.3) : 0
  const gx = flame.x - 10 * Math.max(0, sweep) + 4 * Math.min(0, sweep)
  const gR = shape.glowRadius * 1.5
  const flameInk = state === 'dark' ? 0.82 : 0.04
  const look = state === 'searching' ? 1.4 * Math.sin(t * 1.3 + 0.6) : 0
  return (x, y) => {
    let v = sample(data, x, y)
    // The face is a slate disc; the lenses sit on it and shut to it.
    if (Math.abs(y - eyes.cy) < eyes.r * 1.6 && x > 30 && x < 70) {
      const dy = (y - eyes.cy) / open
      for (const ex of [eyes.left, eyes.right]) {
        const dist = Math.hypot(x - ex, dy)
        const c = disc(dist, eyes.r + 0.8)
        if (c > 0) {
          v += (lens - v) * c
          v += (pupil - v) * disc(Math.hypot(x - ex - look, dy), eyes.pupil)
        }
      }
    }
    // The lantern: a flame, and the light round it, which thins the ink it falls on.
    if (glow > 0) {
      const g = 1 - smoothstep(0, gR, Math.hypot(x - gx, y - flame.y))
      v *= 1 - 0.9 * glow * g * g
    }
    const fx = (x - flame.x) / (lantern.flame.width / 2 + 1.4)
    const fy = (y - flame.y) / (lantern.flame.height / 2 + 1.4)
    const fc = 1 - smoothstep(0.7, 1.1, Math.max(Math.abs(fx), Math.abs(fy)))
    if (fc > 0) v += (flameInk - v) * fc
    return clamp01(v)
  }
}

/** A lantern in a field of ink, and nothing else: no body, no ground but the ink. */
export function lanternField(t: number, state: LampState, inkLevel = 0.5): Field {
  const glow = glowAt(t, state)
  const sweep = state === 'searching' ? Math.sin(t * 1.15) : 0
  const cx = 50 + 20 * sweep
  const cy = 54
  const R = state === 'searching' ? 26 + 16 * glow : 40 + 3 * glow
  const flameInk = state === 'dark' ? 0.78 : 0
  return (x, y) => {
    // The field is a soft disc of ink, so it floats on the paper like the owl's ground does.
    let v = inkLevel * (1 - smoothstep(37, 50, Math.hypot(x - 50, y - 50)))
    const dist = Math.hypot(x - cx, y - cy)
    if (glow > 0) {
      const g = 1 - smoothstep(0, R, dist)
      v *= 1 - 0.97 * clamp01(glow) * Math.pow(g, 1.4)
      // Where the light ends the ink gathers, a ring of swell round the bright.
      const ring = Math.exp(-(((dist - R * 0.85) / 3.2) ** 2))
      v += 0.32 * clamp01(glow) * ring
    }
    // The lantern's own body: a dark swell round the flame.
    const bx = Math.abs(x - cx) / 9
    const by = Math.abs(y - cy) / 12
    const body = 1 - smoothstep(0.85, 1.1, Math.max(bx, by))
    v += (0.94 - v) * body
    // Its hook: a thin arch above.
    const hook = 1 - smoothstep(0.6, 1.4, Math.hypot((x - cx) / 1.1, (y - (cy - 15)) / 6))
    v += (0.94 - v) * hook * 0.8
    const flame = 1 - smoothstep(0.7, 1.1, Math.max(Math.abs(x - cx) / 3.2, Math.abs(y - cy) / 4.4))
    if (flame > 0) v += (flameInk - v) * flame
    return clamp01(v)
  }
}
