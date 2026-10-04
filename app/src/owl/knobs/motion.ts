import { defineTunables } from '@/tune/registry'

/**
 * The owl's behaviour: how long each motion takes, how far the eyes travel, when the
 * lantern lights itself. Same rule as `design.ts`: the `value:` here is the only copy.
 *
 * All of it is read at render and written to the owl as custom properties
 * (`vars.ts`), so a change in the panel lands on every owl on the page at once. The
 * panel's labels, ranges and notes are in `panel/motion.ts`.
 */

export const owlMotionKnobs = defineTunables([
  {
    id: 'owl.design.motion.blink',
    value: true,
  },
  {
    id: 'owl.design.motion.blinkPeriod',
    value: 6.5,
  },
  {
    id: 'owl.design.motion.blinkClosed',
    value: 0.08,
  },
  {
    id: 'owl.design.motion.searchPeriod',
    value: 1.1,
  },
  {
    id: 'owl.design.motion.searchLow',
    value: 0.35,
  },
  {
    id: 'owl.design.motion.searchHigh',
    value: 1,
  },
  {
    id: 'owl.design.motion.glowLit',
    value: 0.7,
  },
  {
    id: 'owl.design.motion.glowFade',
    value: 500,
  },
  {
    id: 'owl.design.motion.shakeTime',
    value: 420,
  },
  {
    id: 'owl.design.motion.shakeReach',
    value: 4,
  },

  {
    id: 'owl.design.motion.gazeFollow',
    value: true,
  },
  {
    id: 'owl.design.motion.gazeTravel',
    value: 0.33,
  },
  {
    id: 'owl.design.motion.gazeEase',
    value: 140,
  },

  {
    id: 'owl.search.swing',
    value: 4,
  },
  {
    id: 'owl.search.scan',
    value: 1,
  },
  {
    id: 'owl.search.lift',
    value: 1.2,
  },
  {
    id: 'owl.design.night.from',
    value: 20,
  },
  {
    id: 'owl.design.night.until',
    value: 6,
  },
])
