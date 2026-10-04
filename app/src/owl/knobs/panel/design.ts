import { describeTunables } from '@/tune/registry'
import '../design'
import { styleOptions } from '../../styles'

/**
 * What the panel draws for each knob in `../design.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/design.ts'

const STYLE = { scope: 'owl', group: 'Look', source: { file: SELF } } as const

const PALETTE = { scope: 'owl', group: 'Palette', kind: 'color', source: { file: SELF } } as const

const STROKE = {
  scope: 'owl',
  group: 'Lines',
  kind: 'number',
  min: 0,
  max: 6,
  step: 0.1,
  source: { file: SELF },
} as const

const SHAPE = { scope: 'owl', group: 'Shapes', kind: 'number', source: { file: SELF } } as const

describeTunables([
  {
    ...STYLE,
    id: 'owl.design.style',
    label: 'Render style',
    kind: 'select',
    options: styleOptions(),
    note: 'How the body is drawn. The eyes, the gaze and the lantern state are the same in every style.',
  },

  {
    ...PALETTE,
    id: 'owl.design.palette.navy',
    label: 'Navy',
    note: 'The body, the head, the lantern frame and the book rims.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.cream',
    label: 'Cream',
    note: 'The disc the owl stands on.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.slate',
    label: 'Slate',
    note: 'The face.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.wing',
    label: 'Wing',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.tan',
    label: 'Tan',
    note: 'The belly.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.gold',
    label: 'Gold',
    note: 'The spectacle rims, the beak and the lantern handle.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.lens',
    label: 'Lens',
    note: 'The fill behind each pupil.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.flame',
    label: 'Flame',
    note: 'The lantern flame and the light it throws.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.page',
    label: 'Page',
    note: 'The books the owl stands on.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.pupil',
    label: 'Pupil',
  },

  {
    ...STROKE,
    id: 'owl.design.stroke.rim',
    label: 'Spectacle rim',
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.book',
    label: 'Book rim',
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.lantern',
    label: 'Lantern frame',
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.handle',
    label: 'Lantern handle',
  },

  {
    ...SHAPE,
    id: 'owl.design.shape.disc',
    label: 'Disc radius',
    min: 30,
    max: 50,
    step: 0.5,
    note: 'In figure units; the figure is 100 across.',
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.bookHeight',
    label: 'Book height',
    min: 2,
    max: 12,
    step: 0.5,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.bookRadius',
    label: 'Book corner radius',
    min: 0,
    max: 5,
    step: 0.25,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.lanternRadius',
    label: 'Lantern corner radius',
    min: 0,
    max: 6,
    step: 0.25,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.glowRadius',
    label: 'Glow radius',
    min: 4,
    max: 40,
    step: 1,
    note: 'How far a lit lantern throws its light. It is allowed to fall outside the disc.',
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.glowCore',
    label: 'Glow strength',
    min: 0,
    max: 1,
    step: 0.05,
    note: 'The gradient’s opacity at its middle; the glow’s overall brightness is under Motion.',
  },
])
