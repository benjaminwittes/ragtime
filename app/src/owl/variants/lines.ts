import type { OwlVariant } from '../types'

/**
 * The line-tile owl, ratified as the main owl on 2026-10-05: tiles of five parallel lines
 * that thicken and thin together (`styles/lines/`), set the way the Print temperament sets
 * the engraving (the page re-seats, the hatching breathes, the ink and the flame flicker, a
 * light bar passes, all stepped), and speaking in `ragtime`, in the Typed note.
 */
export default {
  id: 'lines',
  label: 'Line tiles',
  note: 'The main owl: lines that thicken and thin like ink, in Print, speaking in a typed note.',
  design: {
    style: 'lines',
    voice: 'ragtime',
  },
} satisfies OwlVariant
