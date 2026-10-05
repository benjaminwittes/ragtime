import type { OwlVariant } from '../types'

/**
 * The owl as sent: the line-tile owl (`styles/lines/`), set the way the Print temperament sets
 * the engraving, speaking in a typed note (`voice/voices/ragtime.ts`). Nothing is overridden, so
 * it is the base design exactly; the engraved variants are the others.
 */
export default {
  id: 'base',
  label: 'Line tiles',
  note: 'The main owl: lines that thicken and thin like ink, in Print, speaking in a typed note.',
  design: {},
} satisfies OwlVariant
