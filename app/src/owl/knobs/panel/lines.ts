import { describeTunables } from '@/tune/registry'
import '../lines'

/**
 * What the panel draws for each knob in `../lines.ts`: the group "how the owl is built". Loaded
 * only with the panel (`../all.ts`).
 */

const SELF = 'src/owl/knobs/lines.ts'
const base = (group: string) => ({ scope: 'owl', group, kind: 'number', source: { file: SELF } }) as const

const TILES = base('Build: tiles')
const INK = base('Build: ink')
const MOTION = base('Build: motion')

describeTunables([
  {
    ...TILES,
    id: 'owl.lines.build.lines',
    label: 'Lines per tile',
    kind: 'int',
    min: 0,
    max: 7,
    step: 1,
    note: 'How many parallel lines make one tile, which thicken and thin together. 0 chooses by the size the owl is drawn at: three small, five large.',
  },
  {
    ...TILES,
    id: 'owl.lines.build.pitch',
    label: 'Line spacing',
    min: 0.7,
    max: 1.8,
    step: 0.05,
    note: 'The distance between lines, as a multiple of the size’s own. Wider is fewer, coarser lines.',
  },
  {
    ...TILES,
    id: 'owl.lines.build.tile',
    label: 'Tile width',
    min: 0.4,
    max: 2.5,
    step: 0.05,
    note: 'How far a swell is smoothed along its line. Short tiles keep detail; long ones read as brush strokes.',
  },
  {
    ...TILES,
    id: 'owl.lines.build.lock',
    label: 'Tile lock',
    min: 0,
    max: 1,
    step: 0.05,
    note: '0 lets every line follow the picture on its own. 1 makes a tile’s lines one grey.',
  },
  {
    ...TILES,
    id: 'owl.lines.build.bead',
    label: 'Bead',
    min: 0,
    max: 1.5,
    step: 0.05,
    note: 'How much a swell pinches the ink beside it, as ink on a surface beads. 0 is a plain blur.',
  },
  {
    ...INK,
    id: 'owl.lines.build.minW',
    label: 'Thinnest line',
    min: 0,
    max: 0.4,
    step: 0.02,
    note: 'The narrowest a line gets, as a share of the spacing. Above 0 no line ever goes out.',
  },
  {
    ...INK,
    id: 'owl.lines.build.maxW',
    label: 'Thickest line',
    min: 0.5,
    max: 1.3,
    step: 0.02,
    note: 'The widest a line gets. Above 1 neighbouring lines run into each other, which is how solid black is made.',
  },
  {
    ...INK,
    id: 'owl.lines.build.gamma',
    label: 'Tone curve',
    min: 0.5,
    max: 2,
    step: 0.05,
    note: 'Above 1 lightens the middle greys; below 1 darkens them.',
  },
  {
    ...INK,
    id: 'owl.lines.build.bulge',
    label: 'Lean',
    min: 0,
    max: 1.5,
    step: 0.05,
    note: 'How far a line leans toward a thicker neighbour, so ink gathers where it is dense.',
  },
  {
    ...INK,
    id: 'owl.lines.build.cut',
    label: 'Tail cut',
    min: 0,
    max: 0.3,
    step: 0.02,
    note: 'Ink thinner than this is cut away, so a silhouette ends in a clean edge and not in hairs.',
  },
  {
    ...INK,
    id: 'owl.lines.build.snapPx',
    label: 'Close gaps under',
    min: 0,
    max: 2,
    step: 0.1,
    units: ['px'],
    note: 'Gaps narrower than this, on screen, close, so there are no slivers of paper.',
  },
  {
    ...MOTION,
    id: 'owl.lines.print.amount',
    label: 'Calm: amount',
    min: 0.1,
    max: 2,
    step: 0.05,
    note: 'How far the page and the ink shift in Calm. Lively is this and a half again. The owl’s own blink and breath are not scaled by it.',
  },
  {
    ...MOTION,
    id: 'owl.lines.print.jitter',
    label: 'Jitter, side to side and up and down',
    min: 0,
    max: 3,
    step: 0.1,
    note: 'How far the page re-seats on the glass, about six times a second, and the lines drift out of register with it. A multiple of Calm’s amount; 0 holds the page still.',
  },
  {
    ...MOTION,
    id: 'owl.lines.print.fps',
    label: 'Calm: steps a second',
    kind: 'int',
    min: 4,
    max: 24,
    step: 1,
    note: 'How many times a second the drawing is redrawn. Fewer is a choppier, more printed look.',
  },
])
