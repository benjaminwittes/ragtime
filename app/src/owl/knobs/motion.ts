import { defineTunables } from '@/tune/registry'

/**
 * The owl's behaviour: how long each motion takes, how far the eyes travel, when the
 * lantern lights itself. Same rule as `design.ts`: the `value:` here is the only copy.
 *
 * All of it is read at render and written to the owl as custom properties
 * (`vars.ts`), so a change in the panel lands on every owl on the page at once.
 */

const SELF = 'src/owl/knobs/motion.ts'

const MOTION = { scope: 'owl', group: 'Motion', source: { file: SELF } } as const
const GAZE = { scope: 'owl', group: 'Gaze', source: { file: SELF } } as const
const LANTERN = { scope: 'owl', group: 'Lantern', source: { file: SELF } } as const

export const owlMotionKnobs = defineTunables([
  {
    ...MOTION,
    id: 'owl.design.motion.blink',
    label: 'Blink',
    kind: 'boolean',
    value: true,
  },
  {
    ...MOTION,
    id: 'owl.design.motion.blinkPeriod',
    label: 'Blink period',
    kind: 'number',
    value: 6.5,
    min: 1,
    max: 20,
    step: 0.5,
    note: 'Seconds from one blink to the next. The blink itself is about a seventh of a second.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.blinkClosed',
    label: 'Lid closure',
    kind: 'number',
    value: 0.08,
    min: 0,
    max: 1,
    step: 0.02,
    note: 'How much of the eyes’ height is left when they are shut. 1 is no blink at all.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.searchPeriod',
    label: 'Search pulse',
    kind: 'number',
    value: 1.1,
    min: 0.3,
    max: 4,
    step: 0.1,
    note: 'Seconds for the lantern to breathe in, while something is being looked for.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.searchLow',
    label: 'Pulse, dim',
    kind: 'number',
    value: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    ...MOTION,
    id: 'owl.design.motion.searchHigh',
    label: 'Pulse, bright',
    kind: 'number',
    value: 1,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    ...MOTION,
    id: 'owl.design.motion.glowLit',
    label: 'Lit glow',
    kind: 'number',
    value: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
    note: 'How bright the glow stands while the lantern is lit and not pulsing.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.glowFade',
    label: 'Glow fade',
    kind: 'int',
    value: 500,
    min: 0,
    max: 2000,
    step: 50,
    note: 'Milliseconds for the glow to come up or go down when the lantern state changes.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.shakeTime',
    label: 'Head-shake time',
    kind: 'int',
    value: 420,
    min: 100,
    max: 1500,
    step: 20,
    note: 'Milliseconds for the owl saying no.',
  },
  {
    ...MOTION,
    id: 'owl.design.motion.shakeReach',
    label: 'Head-shake reach',
    kind: 'number',
    value: 4,
    min: 0,
    max: 10,
    step: 0.5,
    note: 'Figure units at the widest. The shake moves the figure, so keep it small enough to stay inside the box a page gave it.',
  },

  {
    ...GAZE,
    id: 'owl.design.motion.gazeFollow',
    label: 'Eyes follow the pointer',
    kind: 'boolean',
    value: true,
  },
  {
    ...GAZE,
    id: 'owl.design.motion.gazeTravel',
    label: 'Gaze travel',
    kind: 'number',
    value: 0.33,
    min: 0,
    max: 0.9,
    step: 0.01,
    note: 'How far a pupil may leave the middle of its lens, as a share of the lens’s radius.',
  },
  {
    ...GAZE,
    id: 'owl.design.motion.gazeEase',
    label: 'Gaze easing',
    kind: 'int',
    value: 140,
    min: 0,
    max: 800,
    step: 10,
    note: 'Milliseconds the pupils take to catch up with the pointer. This is what turns sixty updates a second into a look.',
  },

  {
    ...LANTERN,
    id: 'owl.design.night.from',
    label: 'Night begins',
    kind: 'int',
    value: 20,
    min: 0,
    max: 23,
    step: 1,
    note: 'The hour, by the reader’s clock, after which an owl that keeps hours lights its lantern unasked.',
  },
  {
    ...LANTERN,
    id: 'owl.design.night.until',
    label: 'Night ends',
    kind: 'int',
    value: 6,
    min: 0,
    max: 23,
    step: 1,
    note: 'And the hour it puts it out. A window that ends before it begins wraps midnight.',
  },
])
