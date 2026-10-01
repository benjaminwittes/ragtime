import { defineTunables } from '@/tune/registry'
import { styleOptions } from '../styles'

/**
 * The owl's look: the drawing as sent, as knobs. The `value:` of each declaration is the
 * only copy of that number — `design.ts` at the owl root reads it back — so this file is
 * where to read what the owl is made of, and where "Write to source" lands a keep.
 *
 * Ids are paths into the design: `owl.design.palette.navy` is `design.palette.navy`.
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

export const owlLookKnobs = defineTunables([
  {
    ...STYLE,
    id: 'owl.design.style',
    label: 'Render style',
    kind: 'select',
    value: 'flat',
    options: styleOptions(),
    note: 'How the body is drawn. The eyes, the gaze and the lantern state are the same in every style.',
  },

  {
    ...PALETTE,
    id: 'owl.design.palette.navy',
    label: 'Navy',
    value: '#1F2A44',
    note: 'The body, the head, the lantern frame and the book rims.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.cream',
    label: 'Cream',
    value: '#EFE6D2',
    note: 'The disc the owl stands on.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.slate',
    label: 'Slate',
    value: '#3D4C6E',
    note: 'The face.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.wing',
    label: 'Wing',
    value: '#2E3B57',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.tan',
    label: 'Tan',
    value: '#C9B48A',
    note: 'The belly.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.gold',
    label: 'Gold',
    value: '#E0A93A',
    note: 'The spectacle rims, the beak and the lantern handle.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.lens',
    label: 'Lens',
    value: '#F7E3A6',
    note: 'The fill behind each pupil.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.flame',
    label: 'Flame',
    value: '#F2B84B',
    note: 'The lantern flame and the light it throws.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.page',
    label: 'Page',
    value: '#FFFFFF',
    note: 'The books the owl stands on.',
  },
  {
    ...PALETTE,
    id: 'owl.design.palette.pupil',
    label: 'Pupil',
    value: '#1F2A44',
  },

  {
    ...STROKE,
    id: 'owl.design.stroke.rim',
    label: 'Spectacle rim',
    value: 2.5,
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.book',
    label: 'Book rim',
    value: 1.5,
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.lantern',
    label: 'Lantern frame',
    value: 2,
  },
  {
    ...STROKE,
    id: 'owl.design.stroke.handle',
    label: 'Lantern handle',
    value: 2,
  },

  {
    ...SHAPE,
    id: 'owl.design.shape.disc',
    label: 'Disc radius',
    value: 48,
    min: 30,
    max: 50,
    step: 0.5,
    note: 'In figure units; the figure is 100 across.',
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.bookHeight',
    label: 'Book height',
    value: 6,
    min: 2,
    max: 12,
    step: 0.5,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.bookRadius',
    label: 'Book corner radius',
    value: 1.5,
    min: 0,
    max: 5,
    step: 0.25,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.lanternRadius',
    label: 'Lantern corner radius',
    value: 2,
    min: 0,
    max: 6,
    step: 0.25,
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.glowRadius',
    label: 'Glow radius',
    value: 17,
    min: 4,
    max: 40,
    step: 1,
    note: 'How far a lit lantern throws its light. It is allowed to fall outside the disc.',
  },
  {
    ...SHAPE,
    id: 'owl.design.shape.glowCore',
    label: 'Glow strength',
    value: 0.85,
    min: 0,
    max: 1,
    step: 0.05,
    note: 'The gradient’s opacity at its middle; the glow’s overall brightness is under Motion.',
  },
])
