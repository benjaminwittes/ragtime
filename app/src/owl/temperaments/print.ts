import type { OwlTemperament } from '../types'

/**
 * For the engraved, scanned look: the page re-seats on the glass, the hatching breathes,
 * the flame and the toner flicker, a light bar passes. All of it stepped, so under the scan
 * finish it costs a few filter passes a second and not sixty.
 */
export default {
  id: 'print',
  label: 'Print',
  note: 'For the scanned look: the page re-seats on the glass, the hatching breathes, the ink and the flame flicker, a light bar passes. Stepped.',
  step: 'always',
  behaviours: {
    boil: {},
    'hatch-breath': {},
    breathe: { amount: 0.7 },
    flicker: {},
    toner: {},
    'light-bar': {},
  },
} satisfies OwlTemperament
