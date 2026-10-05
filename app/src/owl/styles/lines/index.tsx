import type { OwlStyle } from '../../types'
import { style as blank } from '../blank'
import { LinesFigure } from './Figure'
import { meta } from './meta'

/**
 * The line-tile style: the owl as a mosaic of tiles of five parallel lines that thicken and
 * thin together, like ink (`lab/lines/`), set the way the Print temperament sets it
 * (`PrintLines.tsx`). It draws the whole figure (`figure`), so the layers are blank: a scaffold asked to draw this style draws no body.
 */
export const style: OwlStyle = { ...blank, ...meta, figure: LinesFigure }
