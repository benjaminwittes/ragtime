import { clamp01, eyeOpen, glowAt, smoothstep, type Field } from './engine'
import type { LampState } from './fields'

/**
 * Owls drawn for the line-tile technique (a lab spike): an ink-density function made of
 * soft-edged ellipses, written in code in the 100 unit box and resolution independent. Each
 * shape paints its ink over what is below it, so the order of a spec is the paint order.
 * Features are made big on purpose: a pupil under one line pitch (about 4.6 units at 56px)
 * is a gap that is not there.
 */

type Ell = { x: number; y: number; rx: number; ry: number; a?: number }

export type OwlSpec = {
  id: string
  label: string
  note: string
  body: Ell
  head: Ell
  /** Ear tufts, left; mirrored about the middle. */
  ear: Ell
  eyeX: number
  eyeY: number
  eyeR: number
  /** Facial disc radius round each eye, in eye radii (0 = none). */
  disc: number
  beak: Ell
  belly: Ell
  wing: Ell
  /** A dark brow over each eye, slanted in; height in units (0 = none). */
  brow: number
  lantern: boolean
}

export const OWLS: OwlSpec[] = [
  {
    id: 'c',
    label: 'Near-circle, huge eyes',
    note: 'One big ball, two huge eyes, small tufts, a lantern in front of the right wing.',
    body: { x: 50, y: 58, rx: 37, ry: 36 },
    head: { x: 50, y: 40, rx: 36, ry: 30 },
    ear: { x: 29, y: 13, rx: 4.6, ry: 6.4, a: -24 },
    eyeX: 15.5,
    eyeY: 44,
    eyeR: 14,
    disc: 1.18,
    beak: { x: 50, y: 56, rx: 3.4, ry: 5 },
    belly: { x: 50, y: 78, rx: 16, ry: 12 },
    wing: { x: 20, y: 66, rx: 6, ry: 15, a: 12 },
    brow: 0,
    lantern: true,
  },
]

/** The head tips now and then: radians, 0 at rest. */
export function tiltAt(t: number, period = 13): number {
  const p = (((t % period) + period) % period) / period
  const bump = Math.max(0, Math.sin(((p - 0.3) / 0.35) * Math.PI))
  return 0.13 * bump * bump
}

/** One ear flicks: degrees, 0 at rest. */
export function earAt(t: number, period = 13): number {
  const p = (((t % period) + period) % period) / period
  const q = (p - 0.46) / 0.1
  return q < 0 || q > 1 ? 0 : 14 * Math.sin(q * Math.PI * 3) * (1 - q)
}

/** A slow breath: 0..1. */
export const breathAt = (t: number) => 0.5 + 0.5 * Math.sin(t * 1.4)

/** Where, in time, each frame of the sheet is taken. */
export const FRAMES = [
  { id: 'rest', label: 'rest', t: 0, state: 'lit' as LampState },
  { id: 'blink', label: 'blink', t: 5.5 * 0.78, state: 'lit' as LampState },
  { id: 'tilt', label: 'head tilt + ear flick', t: 13 * 0.475, state: 'lit' as LampState },
  { id: 'search', label: 'searching: pulse', t: 0.6, state: 'searching' as LampState },
  { id: 'search2', label: 'searching: swung out', t: 2.42, state: 'searching' as LampState },
]

/** Coverage of a soft ellipse at (x, y): 1 inside, 0 outside, a soft edge between. */
function cover(e: Ell, x: number, y: number, edge = 1): number {
  const a = ((e.a ?? 0) * Math.PI) / 180
  const dx = x - e.x
  const dy = y - e.y
  const u = dx * Math.cos(a) + dy * Math.sin(a)
  const v = -dx * Math.sin(a) + dy * Math.cos(a)
  const n = Math.hypot(u / e.rx, v / e.ry)
  const soft = (edge * 0.9) / Math.min(e.rx, e.ry)
  return 1 - smoothstep(1 - soft, 1 + soft, n)
}

const INK = { body: 0.74, head: 0.82, disc: 0.2, belly: 0.24, wing: 0.92, ear: 0.82, dark: 0.96, iris: 0.05, lamp: 0.95 }

export function owlField(spec: OwlSpec, t: number, state: LampState, size = 112): Field {
  // Small, the iris gives ring to the eye: a thicker dark ring survives where a thin one is a grey.
  const iris = size <= 80 ? 0.56 : 0.68
  const open = eyeOpen(t)
  // Shut, the eye is a slit; small, a thicker one, so it is a line and not a grey.
  const floor = size <= 80 ? 0.3 : 0.2
  const tilt = tiltAt(t) * (state === 'searching' ? 1.8 : 1)
  const flick = earAt(t)
  const breath = breathAt(t)
  const body: Ell = { ...spec.body, ry: spec.body.ry * (1 + 0.025 * breath), rx: spec.body.rx * (1 + 0.015 * breath) }
  const belly: Ell = { ...spec.belly, ry: spec.belly.ry * (1 + 0.07 * breath), rx: spec.belly.rx * (1 + 0.05 * breath) }
  const neck = { x: 50, y: spec.head.y + spec.head.ry * 0.7 }
  const look = state === 'searching' ? spec.eyeR * 0.22 * Math.sin(t * 1.3 + 0.6) : 0
  const lamp = { x: 79, y: 70, r: 9 }
  const glow = spec.lantern ? glowAt(t, state) : 0
  // Searching, the lantern swings out and in, and the pocket of light goes with it.
  const lx = lamp.x - (state === 'searching' ? 7 * (0.5 - 0.5 * Math.cos(t * 1.3)) : 0)
  const wingL = spec.wing
  const wingR: Ell = { ...spec.wing, x: 100 - spec.wing.x, a: -(spec.wing.a ?? 0) }
  const earL: Ell = { ...spec.ear, a: (spec.ear.a ?? 0) + flick }
  // The right tuft is a little smaller and a little more upright: symmetric, but alive.
  const earR: Ell = { ...spec.ear, x: 100 - spec.ear.x + 0.6, ry: spec.ear.ry * 0.9, a: -(spec.ear.a ?? 0) + 5 }
  const discR = spec.eyeR * spec.disc
  return (x, y) => {
    let v = 0
    const paint = (c: number, ink: number) => {
      if (c > 0.001) v += (ink - v) * c
    }
    paint(cover(body, x, y), INK.body)
    paint(cover(wingL, x, y), INK.wing)
    paint(cover(wingR, x, y), INK.wing)
    paint(cover(belly, x, y), INK.belly)
    // The head tips about the neck, and everything on it with it.
    const c = Math.cos(tilt)
    const s = Math.sin(tilt)
    const hx = neck.x + (x - neck.x) * c + (y - neck.y) * s
    const hy = neck.y - (x - neck.x) * s + (y - neck.y) * c
    paint(cover(earL, hx, hy, 0.55), INK.ear)
    paint(cover(earR, hx, hy, 0.55), INK.ear)
    paint(cover(spec.head, hx, hy), INK.head)
    for (const side of [-1, 1]) {
      const ex = 50 + side * spec.eyeX
      if (discR > 0) paint(cover({ x: ex, y: spec.eyeY, rx: discR, ry: discR }, hx, hy), INK.disc)
    }
    for (const side of [-1, 1]) {
      const ex = 50 + side * spec.eyeX
      const ey = spec.eyeY
      const R = spec.eyeR
      // An eye: a dark ring, a light iris, a dark pupil. Shut, it is a dark slit.
      const q = (v2: number) => ey + (v2 - ey) / Math.max(open, floor)
      const lit = smoothstep(0.35, 0.8, open)
      paint(cover({ x: ex, y: ey, rx: R, ry: R }, hx, q(hy), 0.8), INK.dark)
      paint(cover({ x: ex, y: ey, rx: R * iris, ry: R * iris }, hx, q(hy), 0.7), INK.iris * lit + INK.dark * (1 - lit))
      paint(cover({ x: ex + look, y: ey, rx: R * 0.36, ry: R * 0.36 }, hx, q(hy), 0.6), INK.dark)
      if (spec.brow > 0) {
        paint(cover({ x: ex, y: ey - R - spec.brow * 0.2, rx: R * 1.15, ry: spec.brow, a: side * 14 }, hx, hy, 0.7), INK.dark)
      }
    }
    paint(cover(spec.beak, hx, hy, 0.7), INK.dark)
    // The lantern: a pocket of light in the ink, ringed by ink that has gathered at its edge.
    if (spec.lantern) {
      if (glow > 0) {
        const g = 1 - smoothstep(0, 30, Math.hypot(x - lx, y - lamp.y))
        v *= 1 - 0.95 * clamp01(glow) * Math.pow(g, 1.3)
      }
      const d = Math.hypot(x - lx, y - lamp.y)
      const ring = smoothstep(lamp.r - 1.6, lamp.r, d) * (1 - smoothstep(lamp.r + 3, lamp.r + 4.8, d))
      paint(ring, INK.lamp)
      paint(1 - smoothstep(lamp.r - 3.4, lamp.r - 1.6, d), state === 'dark' ? 0.78 : 0.02)
    }
    return clamp01(v)
  }
}
