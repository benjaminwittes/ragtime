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
    value: '#007c85',
  },
])
