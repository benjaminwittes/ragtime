import { defineTunables } from '@/tune/registry'

/**
 * The owl's look: the drawing as sent, as knobs. The `value:` of each declaration is the
 * only copy of that number — `design.ts` at the owl root reads it back — so this file is
 * where to read what the owl is made of, and where "Write to source" lands a keep.
 *
 * Ids are paths into the design: `owl.design.palette.navy` is `design.palette.navy`.
 * The labels, ranges and notes the panel draws are in `panel/design.ts`.
 */

export const owlLookKnobs = defineTunables([
  {
    id: 'owl.design.style',
    value: 'lines',
  },

  {
    id: 'owl.design.palette.navy',
    value: '#1F2A44',
  },
  {
    id: 'owl.design.palette.cream',
    value: '#EFE6D2',
  },
  {
    id: 'owl.design.palette.slate',
    value: '#3D4C6E',
  },
  {
    id: 'owl.design.palette.wing',
    value: '#2E3B57',
  },
  {
    id: 'owl.design.palette.tan',
    value: '#C9B48A',
  },
  {
    id: 'owl.design.palette.gold',
    value: '#E0A93A',
  },
  {
    id: 'owl.design.palette.lens',
    value: '#F7E3A6',
  },
  {
    id: 'owl.design.palette.flame',
    value: '#F2B84B',
  },
  {
    id: 'owl.design.palette.page',
    value: '#FFFFFF',
  },
  {
    id: 'owl.design.palette.pupil',
    value: '#1F2A44',
  },

  {
    id: 'owl.design.stroke.rim',
    value: 2.5,
  },
  {
    id: 'owl.design.stroke.book',
    value: 1.5,
  },
  {
    id: 'owl.design.stroke.lantern',
    value: 2,
  },
  {
    id: 'owl.design.stroke.handle',
    value: 2,
  },

  {
    id: 'owl.design.shape.disc',
    value: 48,
  },
  {
    id: 'owl.design.shape.bookHeight',
    value: 6,
  },
  {
    id: 'owl.design.shape.bookRadius',
    value: 1.5,
  },
  {
    id: 'owl.design.shape.lanternRadius',
    value: 2,
  },
  {
    id: 'owl.design.shape.glowRadius',
    value: 17,
  },
  {
    id: 'owl.design.shape.glowCore',
    value: 0.85,
  },
])
