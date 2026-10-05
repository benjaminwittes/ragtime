import { computeLines, presetFor, smoothstep, type Field, type LineParams } from './engine'
import { contour, hatchPath, type Engrave } from './engrave'
import { lanternField, type LampState } from './fields'
import type { LineKnobs, LineSubject } from './knobs'
import { OWLS, owlField } from './owls'

/**
 * The line-tile drawing for v2. The engine and the owl's ink function are the first lab's,
 * read and not changed; what is added here is what the Print temperament does to a drawing
 * made of lines: the hatching drifts out of register, the hatching breathes, the flame's
 * pocket of light gutters. All three are inputs to one draw, so a frame is still one path.
 */

const BOUNDS: Record<LineSubject, LineParams['bounds']> = {
  c: { x0: 6, y0: 6, x1: 94, y1: 94 },
  lantern: { x0: 12, y0: 12, x1: 88, y1: 88 },
}

/** What Print adds to one frame. All 0 is the plain drawing. */
export type Wobble = {
  /** The line screen, shifted out of register against the page, in units. */
  dx: number
  dy: number
  /** -1..1: the hatching thickens and thins as a whole. */
  breath: number
  /** 0..1: how far the lit flame is dimmed, by returning ink to its pocket of light. */
  gutter: number
}

export const STILL_WOBBLE: Wobble = { dx: 0, dy: 0, breath: 0, gutter: 0 }

/** Where the pocket of light sits, so the flicker can put ink back in it. */
function pocket(subject: LineSubject, state: LampState): { x: number; y: number; r: number } | null {
  if (state === 'dark') return null
  return subject === 'c' ? { x: 79, y: 70, r: 30 } : { x: 50, y: 54, r: 40 }
}

/** What one frame of the owl is made of: the lines, and with the engraving on, the second screen and the keyline. */
export type Frame = { d: string; hatch: string; hatchTransform: string; key: string }

function frame(subject: LineSubject, size: number, knobs: LineKnobs, t: number, state: LampState, w: Wobble, engrave: Engrave | null): Frame {
  const preset = presetFor(size)
  const params: LineParams = {
    ...knobs,
    size,
    lines: knobs.lines > 0 ? knobs.lines : preset.lines,
    pitchPx: preset.pitchPx * knobs.pitch,
    tile: preset.tile * knobs.tile,
    snapPx: knobs.snapPx,
    gamma: knobs.gamma * (1 + 0.14 * w.breath),
    maxW: knobs.maxW * (1 + 0.035 * w.breath),
    bounds: BOUNDS[subject],
  }
  const spec = OWLS.find((o) => o.id === subject)
  const base: Field = spec ? owlField(spec, t, state, size) : lanternField(t, state)
  const hole = w.gutter > 0 ? pocket(subject, state) : null
  const field: Field =
    w.dx === 0 && w.dy === 0 && !hole
      ? base
      : (x, y) => {
          let v = base(x + w.dx, y + w.dy)
          if (hole) {
            const g = 1 - smoothstep(0, hole.r, Math.hypot(x - hole.x, y - hole.y))
            v = Math.min(1, v + 0.3 * w.gutter * Math.pow(g, 1.3))
          }
          return v
        }
  const d = computeLines(field, params).d
  if (!engrave) return { d, hatch: '', hatchTransform: '', key: '' }
  const h = engrave.hatch > 0 ? hatchPath(field, engrave, params) : { d: '', transform: '' }
  const key = engrave.keyline > 0 ? contour(field, 0.42, 4, 4, 96, 96, 1) : ''
  return { d, hatch: h.d, hatchTransform: h.transform, key }
}

export function drawLines(subject: LineSubject, size: number, knobs: LineKnobs, t: number, state: LampState, w: Wobble = STILL_WOBBLE): string {
  return frame(subject, size, knobs, t, state, w, null).d
}

/** The whole frame: lines, and the engraving over them when `engrave` is given. */
export function drawFrame(subject: LineSubject, size: number, knobs: LineKnobs, t: number, state: LampState, w: Wobble, engrave: Engrave | null): Frame {
  return frame(subject, size, knobs, t, state, w, engrave)
}

/** A small seeded stream, so a boil is the same boil each visit and does not repeat in the ear. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
