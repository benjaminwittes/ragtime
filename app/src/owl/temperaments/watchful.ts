import type { OwlTemperament } from '../types'

/** Attentive: it breathes, cants its head, looks about when nothing is moving, and starts if poked. */
export default {
  id: 'watchful',
  label: 'Watchful',
  note: 'Attentive: a head tilt now and then, an idle glance, a double blink, a start if it is clicked.',
  behaviours: {
    breathe: { amount: 0.8 },
    tilt: { period: 0.8 },
    glance: {},
    'double-blink': {},
    'lantern-sway': { amount: 0.5, period: 1.3 },
    nod: { amount: 0.8, period: 1.5 },
    startle: {},
  },
} satisfies OwlTemperament
