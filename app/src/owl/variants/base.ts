import type { OwlVariant } from '../types'

/**
 * The owl as sent: the line-tile owl (`styles/lines/`), set in Print, speaking by writing its words as lines
 * (`hub/lineMorph/`, `voice/voices/ragtime.ts`). Nothing is overridden, so it is the base design exactly.
 */
export default {
  id: 'base',
  label: 'Line tiles',
  note: 'The main owl: lines that thicken and thin like ink, in Print, writing its words as lines.',
  design: {},
} satisfies OwlVariant
