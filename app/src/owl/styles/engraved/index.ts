import type { OwlStyle } from '../../types'
import { Beak, Belly, Body, EyeDetail, Frame, Ground, Head, Lantern, Wing } from './layers'

/**
 * The engraved style: the owl as a line engraving, drawn as a variable-width line screen.
 * The plate is `plate.ts`, the settings are `knobs/engraved.ts`, and the scanned-document
 * finish is `scan.ts`; this file only assembles them into a style.
 */
export const style: OwlStyle = {
  id: 'engraved',
  label: 'Engraved',
  // The order its ribbons were tuned in: the plate's own, with the head's regions last.
  headLast: true,
  frame: Frame,
  ground: Ground,
  body: Body,
  head: Head,
  eyeDetail: EyeDetail,
  beak: Beak,
  belly: Belly,
  wing: Wing,
  lantern: Lantern,
}
