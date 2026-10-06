import { defineTunables } from '@/tune/registry'

/**
 * How the owl is built: the line-tile drawing's own numbers (`styles/lines/engine.ts`) and the
 * pace of its motion. The `value:` of each declaration is the only copy of
 * that number; `styles/lines/useBuild.ts` reads them into the drawing, so a knob moved in the
 * panel is the owl on the page changing. The labels, ranges and notes are in `panel/lines.ts`.
 *
 * None is a path into the design (the ids do not begin `owl.design.`).
 */

export const owlLinesKnobs = defineTunables([
  // The tiles.
  { id: 'owl.lines.build.lines', value: 2 },
  { id: 'owl.lines.build.pitch', value: 1.2 },
  { id: 'owl.lines.build.tile', value: 1 },
  { id: 'owl.lines.build.lock', value: 0.1 },
  { id: 'owl.lines.build.bead', value: 0.6 },
  // The ink.
  { id: 'owl.lines.build.minW', value: 0.06 },
  { id: 'owl.lines.build.maxW', value: 0.88 },
  { id: 'owl.lines.build.gamma', value: 1.6 },
  { id: 'owl.lines.build.bulge', value: 0.4 },
  { id: 'owl.lines.build.cut', value: 0.06 },
  { id: 'owl.lines.build.snapPx', value: 0 },
  // The pace of Calm; Lively is the same shape, faster and further.
  { id: 'owl.lines.print.amount', value: 0.85 },
  { id: 'owl.lines.print.jitter', value: 0 },
  { id: 'owl.lines.print.fps', value: 20 },
])
