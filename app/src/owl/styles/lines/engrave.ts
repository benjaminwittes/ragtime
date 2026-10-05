import { computeLines, smoothstep, type Field, type LineParams } from './engine'

/**
 * The engraving as an effect on the line-tile owl, and not a second drawing. An engraver
 * works the dark of a plate twice: the swelling lines that make the tone, then a second screen
 * cut across them at an angle where it is deepest, and a fine keyline round the form to hold
 * its edge. Here the first is the owl as it is already drawn; this adds the other two, from the
 * same ink function, so they follow the blink, the tilt and the page's shifting for free.
 */

export type Engrave = {
  /** 0..1: how far into the lighter tones the cross-hatch reaches. 0 is none. */
  hatch: number
  /** Degrees the second screen is cut at. */
  angle: number
  /** The second screen's line spacing, in pitches of the first. */
  pitch: number
  /** The keyline's width, in units of the 100 box. 0 is none. */
  keyline: number
}

export const ENGRAVE_DEFAULT: Engrave = { hatch: 0.7, angle: 52, pitch: 1.5, keyline: 0.45 }

/**
 * The second screen: the same field turned by `angle`, kept only where it is dark, drawn as
 * thin lines by the same engine, and returned as a path to be turned back by `transform`.
 */
export function hatchPath(field: Field, e: Engrave, base: LineParams): { d: string; transform: string } {
  const a = (e.angle * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  // The turned frame's (x, y) is the owl's (u, v): rotate by -angle about the middle.
  const turned: Field = (x, y) => {
    const dx = x - 50
    const dy = y - 50
    const u = 50 + dx * cos + dy * sin
    const v = 50 - dx * sin + dy * cos
    const ink = field(u, v)
    return smoothstep(0.78 - 0.4 * e.hatch, 0.97, ink) * 0.9
  }
  const params: LineParams = {
    ...base,
    lines: 1,
    pitchPx: base.pitchPx * e.pitch,
    tile: Math.max(0.8, base.tile * 0.3),
    lock: 0,
    bead: 0.2,
    minW: 0,
    maxW: 0.5,
    gamma: 1,
    bulge: 0,
    cut: 0.08,
    snapPx: 0,
    // The turned square has to cover the owl's whole box.
    bounds: { x0: -22, y0: -22, x1: 122, y1: 122 },
  }
  return { d: computeLines(turned, params).d, transform: `rotate(${e.angle} 50 50)` }
}

/** Marching squares: the line where `field` crosses `level`, as separate short segments. Pure. */
export function contour(field: Field, level: number, x0: number, y0: number, x1: number, y1: number, step: number): string {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1)
  const ny = Math.max(2, Math.ceil((y1 - y0) / step) + 1)
  const grid = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = field(x0 + i * step, y0 + j * step)
  const r = (v: number) => Math.round(v * 20) / 20
  const edge = (ax: number, ay: number, av: number, bx: number, by: number, bv: number): [number, number] => {
    const t = bv === av ? 0.5 : (level - av) / (bv - av)
    return [ax + (bx - ax) * t, ay + (by - ay) * t]
  }
  let out = ''
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = grid[j * nx + i]!
      const b = grid[j * nx + i + 1]!
      const c = grid[(j + 1) * nx + i + 1]!
      const d = grid[(j + 1) * nx + i]!
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0)
      if (idx === 0 || idx === 15) continue
      const x = x0 + i * step
      const y = y0 + j * step
      const top = () => edge(x, y, a, x + step, y, b)
      const right = () => edge(x + step, y, b, x + step, y + step, c)
      const bottom = () => edge(x, y + step, d, x + step, y + step, c)
      const left = () => edge(x, y, a, x, y + step, d)
      const seg = (p: [number, number], q: [number, number]) => `M${r(p[0])} ${r(p[1])}L${r(q[0])} ${r(q[1])}`
      switch (idx) {
        case 1:
        case 14:
          out += seg(left(), bottom())
          break
        case 2:
        case 13:
          out += seg(bottom(), right())
          break
        case 3:
        case 12:
          out += seg(left(), right())
          break
        case 4:
        case 11:
          out += seg(top(), right())
          break
        case 5:
          out += seg(top(), left()) + seg(bottom(), right())
          break
        case 6:
        case 9:
          out += seg(top(), bottom())
          break
        case 7:
        case 8:
          out += seg(top(), left())
          break
        case 10:
          out += seg(top(), right()) + seg(left(), bottom())
          break
      }
    }
  }
  return out
}
