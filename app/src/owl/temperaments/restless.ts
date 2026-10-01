import type { OwlTemperament } from '../types'

/** Fidgety: everything faster, further and more often. */
export default {
  id: 'restless',
  label: 'Restless',
  note: 'Fidgety: quick breaths, a lean, tilts, wing settles, glances and double blinks, all more often.',
  behaviours: {
    breathe: { amount: 1.25, period: 0.7 },
    sway: { amount: 1.5, period: 0.7 },
    tilt: { amount: 1.3, period: 0.5 },
    shrug: { amount: 1.2, period: 0.55 },
    'lantern-sway': { amount: 1.5, period: 0.7 },
    glance: { amount: 1.3, period: 0.5 },
    'double-blink': { period: 0.5 },
    nod: { period: 0.6 },
    startle: { amount: 1.3 },
  },
} satisfies OwlTemperament
