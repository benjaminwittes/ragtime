import { describeTunables } from '@/tune/registry'
import '../morph'

/**
 * What the panel draws for each knob in `../morph.ts`: the group "Writing", the line morph the owl's words
 * write themselves with. Loaded only with the panel (`../all.ts`).
 */

const SELF = 'src/owl/knobs/morph.ts'
const base = { scope: 'owl', group: 'Writing', kind: 'number', source: { file: SELF } } as const

describeTunables([
  {
    ...base,
    id: 'owl.morph.seconds',
    label: 'Time to write',
    min: 0.2,
    max: 3,
    step: 0.1,
    note: 'Seconds from nothing to the finished text, for one row. Rows after the first start later and all finish together.',
  },
  {
    ...base,
    id: 'owl.morph.pitch',
    label: 'Line spacing',
    min: 1.5,
    max: 12,
    step: 0.1,
    note: 'The distance between lines, scaled by the type size, so a small note has finer lines and not fewer.',
  },
  {
    ...base,
    id: 'owl.morph.cover',
    label: 'Line weight',
    min: 0.05,
    max: 1,
    step: 0.05,
    note: 'How heavy the window’s flat lines are.',
  },
  {
    ...base,
    id: 'owl.morph.window',
    label: 'Window width',
    min: 0.1,
    max: 1,
    step: 0.01,
    note: 'The block of flat lines that crosses each row, as a fraction of the row’s box.',
  },
  {
    ...base,
    id: 'owl.morph.spread',
    label: 'Halftone spread',
    kind: 'int',
    min: 0,
    max: 30,
    step: 1,
    note: 'How far, in pixels, a letter’s tone spreads into the lines around it. More is a softer halftone.',
  },
  {
    ...base,
    id: 'owl.morph.gain',
    label: 'Halftone gain',
    min: 0.5,
    max: 4,
    step: 0.1,
    note: 'How strongly the lines swell where the letters are.',
  },
  {
    ...base,
    id: 'owl.morph.ramp',
    label: 'Ramp length',
    min: 0.1,
    max: 3,
    step: 0.01,
    note: 'The morph is a band laid across the window. This is its length in window widths: flat lines at one end, the finished text at the other.',
  },
  {
    ...base,
    id: 'owl.morph.shift',
    label: 'Ramp shift',
    min: -1,
    max: 1,
    step: 0.01,
    note: 'Slides the band against the window, in window widths, without moving the window. Right makes the morph run ahead of the lines; left makes it trail behind. Eased to zero at the start and end.',
  },
  {
    ...base,
    id: 'owl.morph.trail',
    label: 'Trail',
    min: 0,
    max: 2,
    step: 0.01,
    note: 'How far behind the window the lines keep going, thinning to nothing, in window widths.',
  },
  {
    ...base,
    id: 'owl.morph.entry',
    label: 'Entry',
    min: 0,
    max: 2,
    step: 0.01,
    note: 'How far ahead of the window the lines thin in, in window widths. The same taper as the trail, mirrored.',
  },
  {
    ...base,
    id: 'owl.morph.pieces',
    label: 'Pieces per letter',
    kind: 'int',
    min: 1,
    max: 24,
    step: 1,
    note: 'Each letter is cut into this many slices that turn one at a time, so the change runs through a letter. More costs more.',
  },
  {
    ...base,
    id: 'owl.morph.stagger',
    label: 'Row stagger',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How far one row’s start is behind the row above, as a fraction of a row’s own length. 0 writes every row at once; 1 writes them one after another.',
  },
])
