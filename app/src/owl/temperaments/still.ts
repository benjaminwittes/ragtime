import type { OwlTemperament } from '../types'

/** Barely there: the owl breathes, slowly and shallowly, and does nothing else. */
export default {
  id: 'still',
  label: 'Still',
  note: 'Alive and not much more: a slow, shallow breath.',
  behaviours: {
    breathe: { amount: 0.5, period: 1.4 },
  },
} satisfies OwlTemperament
