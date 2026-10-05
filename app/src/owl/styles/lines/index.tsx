import type { OwlStyle } from '../../types'
import { style as flat } from '../flat'
import { LinesFigure } from './Figure'
import { meta } from './meta'

/**
 * The line-tile style: the owl as a mosaic of tiles of five parallel lines that thicken and
 * thin together, like ink (`lab/lines/`), set the way the Print temperament sets it
 * (`PrintLines.tsx`). It draws the whole figure (`figure`), so the layers are the flat
 * style's: they are what the lab's scaffold draws if it is asked for this style.
 */
export const style: OwlStyle = { ...flat, ...meta, figure: LinesFigure }
