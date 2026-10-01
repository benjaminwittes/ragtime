import { allTunables } from '@/tune/registry'
import type { TuneValue } from '@/tune/types'
import './knobs'
import { DESIGN_PREFIX, designFromDefaults } from './resolve'
import type { OwlDesign, OwlPose, PoseGeometry } from './types'

/**
 * The owl's base design: the one place its measurements live.
 *
 * It is assembled from two halves, and the split is the point.
 *
 *   - **Structure** is what a knob cannot express — the pose tables, the empty standing
 *     and params records. It is plain typed data, here.
 *   - **Scalars** — every colour, stroke width, radius and timing — are declared once, as
 *     knobs, in `knobs/` (`knobs/design.ts`, `knobs/motion.ts`). The `value:` of that
 *     declaration *is* the default; this file reads it back out of the tuning registry
 *     rather than keeping a second copy. That is what lets "Write to source" in the
 *     Tune panel patch the one literal that production reads, and it is why the
 *     declarations ship (`src/tune/registry.ts`: they carry the defaults the app runs
 *     on). A knob id names its place in the design: `owl.design.palette.navy` is
 *     `design.palette.navy`.
 *
 * A variant (`variants/`) is a patch over the result, and a tuned knob goes over that
 * (`resolve.ts`).
 */

/**
 * Each pose's own measurements, lifted from its concept. The owl on the stacks is the
 * standing owl redrawn a little smaller and higher rather than the same shapes moved, so
 * the two are two tables and not one table and an offset.
 */
const POSES: Record<OwlPose, PoseGeometry> = {
  archivist: {
    body: 'M24 92 L24 62 Q24 42 50 36 Q76 42 76 62 L76 92 Z',
    head: 'M27 44 L34 14 L42 25 Q50 21 58 25 L66 14 L73 44 Q62 35 50 35 Q38 35 27 44 Z',
    face: { cy: 38, r: 13 },
    eyes: { left: 44, right: 56, cy: 38, r: 6, pupil: 2.2 },
    beak: '50,43 47.5,47.5 52.5,47.5',
    belly: { cy: 68, rx: 10, ry: 14 },
    wings: [
      { cx: 28, cy: 66, rx: 5, ry: 11 },
      { cx: 72, cy: 64, rx: 5, ry: 11 },
    ],
    lantern: {
      handle: { x: 74, y1: 73, y2: 77 },
      frame: { x: 68, y: 77, width: 12, height: 14 },
      flame: { x: 71.5, y: 80.5, width: 5, height: 7 },
    },
    books: [],
  },
  stacks: {
    body: 'M28 76 L28 56 Q28 38 50 32 Q72 38 72 56 L72 76 Z',
    head: 'M30 40 L36 12 L43 22 Q50 18 57 22 L64 12 L70 40 Q60 31 50 31 Q40 31 30 40 Z',
    face: { cy: 34, r: 12 },
    eyes: { left: 44.5, right: 55.5, cy: 34, r: 5.5, pupil: 2 },
    beak: '50,38.5 47.7,42.5 52.3,42.5',
    belly: { cy: 60, rx: 9, ry: 12 },
    wings: [
      { cx: 32, cy: 58, rx: 4.5, ry: 10 },
      { cx: 68, cy: 56, rx: 4.5, ry: 10 },
    ],
    lantern: {
      handle: { x: 70, y1: 64, y2: 67 },
      frame: { x: 65, y: 67, width: 11, height: 12 },
      flame: { x: 68, y: 70, width: 5, height: 6 },
    },
    books: [
      { x: 18, y: 88, width: 64 },
      { x: 21, y: 81, width: 58 },
      { x: 24, y: 74, width: 52 },
    ],
  },
}

const STRUCTURE: Partial<OwlDesign> = {
  standing: {},
  voice: null,
  params: {},
  poses: POSES,
}

let base: OwlDesign | undefined

/** The knobs' declared defaults, by id — what the app runs on before anyone tunes anything. */
function declaredDefaults(): Record<string, TuneValue> {
  const out: Record<string, TuneValue> = {}
  for (const knob of allTunables()) {
    if (knob.id.startsWith(DESIGN_PREFIX)) out[knob.id] = knob.value
  }
  return out
}

/**
 * The base design. Built on first use rather than at import, so every knob file —
 * including ones a later builder adds under `knobs/` — has registered by then.
 */
export function baseDesign(): OwlDesign {
  base ??= designFromDefaults(STRUCTURE, declaredDefaults())
  return base
}
