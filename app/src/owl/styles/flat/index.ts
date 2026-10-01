import type { OwlStyle } from '../../types'
import { Behind, Front, Lantern } from './layers'

/** The flat style: the owl as the concept sheet draws it. The drawing is `layers.tsx`. */
export const style: OwlStyle = {
  id: 'flat',
  label: 'Flat',
  behind: Behind,
  front: Front,
  lantern: Lantern,
}
