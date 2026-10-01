import type { OwlTemperament } from '../types'

/** Nearly asleep: deep slow breaths, lids that sink, nods, a lantern that hardly moves. */
export default {
  id: 'drowsy',
  label: 'Drowsy',
  note: 'Nearly asleep: deep slow breaths, sinking lids, frequent nods, a lazy lean.',
  behaviours: {
    breathe: { amount: 1.15, period: 1.45 },
    drowsy: {},
    'slow-blink': { period: 0.7 },
    nod: { amount: 1.2, period: 0.6 },
    sway: { amount: 0.7, period: 1.3 },
    'lantern-sway': { amount: 0.4, period: 1.4 },
  },
} satisfies OwlTemperament
