import type { OwlStyle } from '../../types'
import { LinesFigure } from './Figure'
import { meta } from './meta'

/**
 * The line-tile style: the owl as a mosaic of tiles of five parallel lines that thicken and
 * thin together, like ink (`engine.ts`), set in Print
 * (`PrintLines.tsx`), with the engraving as a mode of it (`engrave.ts`).
 */
export const style: OwlStyle = { ...meta, figure: LinesFigure }
