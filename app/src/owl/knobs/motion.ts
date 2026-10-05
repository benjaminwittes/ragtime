import { defineTunables } from '@/tune/registry'

/**
 * The hours the owl lights its lantern unasked. The `value:` here is the only copy, as in
 * `design.ts`; the panel's labels and notes are in `panel/motion.ts`. (The owl's other
 * motion is the line-tile drawing's own: `styles/lines/`.)
 */

export const owlMotionKnobs = defineTunables([
  {
    id: 'owl.design.night.from',
    value: 20,
  },

  {
    id: 'owl.design.night.until',
    value: 6,
  },
])
