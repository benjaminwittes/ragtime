import type { OwlStyle } from '../../types'
import { Behind, EyeDetail, Frame, Front, Lantern } from './layers'

/**
 * The engraved style: the owl as a line engraving, drawn as a variable-width line screen.
 * The plate is `plate.ts`, the settings are `knobs/engraved.ts`, and the scanned-document
 * finish is `scan.ts`; this file only assembles them into a style.
 */
export const style: OwlStyle = {
  id: 'engraved',
  label: 'Engraved',
  frame: Frame,
  behind: Behind,
  eyeDetail: EyeDetail,
  front: Front,
  lantern: Lantern,
}
