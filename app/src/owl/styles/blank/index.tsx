import type { OwlStyle } from '../../types'
import { Blank } from './Blank'
import { meta } from './meta'

/**
 * Nothing: an owl's box with no drawing in it. It is the style an owl has while the one it was
 * asked for is on its way (and when a design names one that is not registered), so it is always
 * here and never fetched. The owl's box is its own (the page sizes it by class), so the swap to
 * the real drawing moves nothing.
 */
export const style: OwlStyle = { ...meta, figure: Blank }
