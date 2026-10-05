import { clamp01, glowAt, smoothstep, type Field } from './engine'

/**
 * The lantern spike's picture (a lab spike): no owl, a lantern in a field of ink. The owls
 * are in `owls.ts`. A field answers "how much ink here", 0 for paper, 1 for the darkest.
 */

export type LampState = 'lit' | 'searching' | 'dark'

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
