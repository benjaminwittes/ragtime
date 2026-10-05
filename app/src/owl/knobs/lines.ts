import { defineTunables } from '@/tune/registry'

/**
 * How the owl is built: the line-tile drawing's own numbers (`styles/lines/engine.ts`), the
 * engraving's, and the pace of its motion. The `value:` of each declaration is the only copy of
 * that number; `styles/lines/useBuild.ts` reads them into the drawing, so a knob moved in the
 * panel is the owl on the page changing. The labels, ranges and notes are in `panel/lines.ts`.
 *
 * None is a path into the design (the ids do not begin `owl.design.`).
 */

export const owlLinesKnobs = defineTunables([
  // The tiles.
  { id: 'owl.lines.build.lines', value: 0 },
  { id: 'owl.lines.build.pitch', value: 1 },
  { id: 'owl.lines.build.tile', value: 1 },
  { id: 'owl.lines.build.lock', value: 0.5 },
  { id: 'owl.lines.build.bead', value: 0.6 },
  // The ink.
  { id: 'owl.lines.build.minW', value: 0 },
  { id: 'owl.lines.build.maxW', value: 1.08 },
  { id: 'owl.lines.build.gamma', value: 1.6 },
  { id: 'owl.lines.build.bulge', value: 0.5 },
  { id: 'owl.lines.build.cut', value: 0.1 },
  { id: 'owl.lines.build.snapPx', value: 0.9 },
  // The engraving.
  { id: 'owl.lines.engrave.hatch', value: 0.7 },
  { id: 'owl.lines.engrave.angle', value: 52 },
  { id: 'owl.lines.engrave.pitch', value: 1.5 },
  { id: 'owl.lines.engrave.keyline', value: 0.45 },
  // The pace of Calm; Lively is the same shape, faster and further.
  { id: 'owl.lines.print.amount', value: 0.45 },
  { id: 'owl.lines.print.fps', value: 12 },
])
