import type { OwlStyle } from '../../types'
import { Beak, Belly, Body, Ground, Head, Lantern, Wing } from './layers'

/** The flat style: the owl as the concept sheet draws it. The drawing is `layers.tsx`. */
export const style: OwlStyle = {
  id: 'flat',
  label: 'Flat',
  ground: Ground,
  body: Body,
  head: Head,
  beak: Beak,
  belly: Belly,
  wing: Wing,
  lantern: Lantern,
}
