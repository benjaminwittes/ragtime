import { defineTunables } from '@/tune/registry'
import { temperamentOptions } from '../../temperaments'

/**
 * What the owl does when it is simply standing there: the temperament, the master switch,
 * and for each behaviour (`standing/`) a switch, an amount and a period.
 *
 * None of these is a path into the design (the ids begin `owl.standing.`, not
 * `owl.design.`), because the design's own `standing` record is empty for the owl as sent
 * and `design.test.ts` pins that. They are read by `standing/core/resolve.ts`, which lays
 * them over the variant's temperament. Every default here means "no opinion": the switches
 * are `inherit` (what the temperament says), the amounts and periods are multiples of 1.
 * So with nothing tuned the owl is the variant's, and the base variant is perfectly still.
 *
 * A behaviour's amount is how far or how strongly it acts, as a multiple of its own
 * default; its period is how long a cycle takes, or the mean gap between gestures, as a
 * multiple of its own default. The defaults are the numbers in each behaviour's file.
 *
 * Deferred (`./index.ts` says what that is) because nothing reads these *declared* values:
 * standing is resolved from what is tuned, so in a build without the panel the declarations
 * would be 14 kB that decide nothing.
 */

const SELF = 'src/owl/knobs/deferred/standing.ts'

const TOP = { scope: 'owl', group: 'Standing', source: { file: SELF } } as const

const g = (name: string) => ({ scope: 'owl', group: `Standing · ${name}`, source: { file: SELF } }) as const

const SWITCH = {
  kind: 'select',
  options: [
    { label: 'From the temperament', value: 'inherit' },
    { label: 'On', value: 'on' },
    { label: 'Off', value: 'off' },
  ],
} as const

const AMOUNT = { kind: 'number', min: 0, max: 3, step: 0.05 } as const
const PERIOD = { kind: 'number', min: 0.2, max: 5, step: 0.05 } as const

export const owlStandingKnobs = defineTunables([
  {
    ...TOP,
    id: 'owl.standing.master',
    label: 'Standing motion',
    kind: 'boolean',
    value: true,
    note: 'Off, nothing below runs and every owl stands as the base owl does. On, each owl does what its variant’s temperament (or the one picked here) says.',
  },
  {
    ...TOP,
    id: 'owl.standing.temperament',
    label: 'Temperament',
    kind: 'select',
    value: 'inherit',
    options: temperamentOptions(),
    note: 'A named set of behaviours and how strongly each runs. “From the variant” uses the one the variant names, which is none for most. The switches below win over it.',
  },
  {
    ...TOP,
    id: 'owl.standing.step',
    label: 'Stepped motion',
    kind: 'select',
    value: 'inherit',
    options: [
      { label: 'From the temperament', value: 'inherit' },
      { label: 'Only under the scan finish', value: 'auto' },
      { label: 'Always', value: 'always' },
      { label: 'Never', value: 'never' },
    ],
    note: 'Whether looped motion is held in steps, like an animation on twos. Under the scan finish every frame re-runs the filter, so steps are what keep it cheap; the temperaments choose, and “Only under the scan finish” is the default.',
  },
  {
    ...TOP,
    id: 'owl.standing.fps',
    label: 'Step rate',
    kind: 'int',
    value: 10,
    min: 2,
    max: 30,
    step: 1,
    note: 'Steps a second for looped motion when it is stepped. The print behaviours (boil, flicker, toner) have a rate of their own, which is their period.',
  },
  {
    ...TOP,
    id: 'owl.standing.seed',
    label: 'Seed',
    kind: 'int',
    value: 0,
    min: 0,
    max: 999,
    step: 1,
    note: 'Mixed into every random draw and every starting phase. The same seed replays the same fidgets; each owl on the page also has a place of its own.',
  },

  {
    ...g('Breathing'),
    ...SWITCH,
    id: 'owl.standing.breathe.on',
    label: 'Breathing',
    value: 'inherit',
    note: 'The chest fills and the belly swells; the head and wings rise with it.',
  },
  {
    ...g('Breathing'),
    ...AMOUNT,
    id: 'owl.standing.breathe.amount',
    label: 'Breathing amount',
    value: 1,
    note: 'A multiple of the default: 1.4% wider and 1% taller at the top of the breath.',
  },
  {
    ...g('Breathing'),
    ...PERIOD,
    id: 'owl.standing.breathe.period',
    label: 'Breathing period',
    value: 1,
    note: 'A multiple of the default of 5.3 seconds a breath.',
  },

  {
    ...g('Weight shift'),
    ...SWITCH,
    id: 'owl.standing.sway.on',
    label: 'Weight shift',
    value: 'inherit',
    note: 'A slow lean from one foot to the other, the whole figure about its base.',
  },
  {
    ...g('Weight shift'),
    ...AMOUNT,
    id: 'owl.standing.sway.amount',
    label: 'Weight shift amount',
    value: 1,
    note: 'A multiple of the default: a 0.65 degree lean.',
  },
  {
    ...g('Weight shift'),
    ...PERIOD,
    id: 'owl.standing.sway.period',
    label: 'Weight shift period',
    value: 1,
    note: 'A multiple of the default of 11.3 seconds a lean.',
  },

  {
    ...g('Head tilt'),
    ...SWITCH,
    id: 'owl.standing.tilt.on',
    label: 'Head tilt',
    value: 'inherit',
    note: 'Now and then the head cants to one side, and the face turns a little further than the outline.',
  },
  {
    ...g('Head tilt'),
    ...AMOUNT,
    id: 'owl.standing.tilt.amount',
    label: 'Head tilt amount',
    value: 1,
    note: 'A multiple of the default: a 3.2 degree cant and a 1.1 unit turn.',
  },
  {
    ...g('Head tilt'),
    ...PERIOD,
    id: 'owl.standing.tilt.period',
    label: 'Head tilt period',
    value: 1,
    note: 'A multiple of the default mean gap of 14 seconds.',
  },

  {
    ...g('Nod'),
    ...SWITCH,
    id: 'owl.standing.nod.on',
    label: 'Nod',
    value: 'inherit',
    note: 'The head dips and comes back, now and then, and whenever the owl speaks (a voice has to be on).',
  },
  {
    ...g('Nod'),
    ...AMOUNT,
    id: 'owl.standing.nod.amount',
    label: 'Nod amount',
    value: 1,
    note: 'A multiple of the default: a 1.1 unit dip. The nod that answers speech is 0.6 of this.',
  },
  {
    ...g('Nod'),
    ...PERIOD,
    id: 'owl.standing.nod.period',
    label: 'Nod period',
    value: 1,
    note: 'A multiple of the default mean gap of 24 seconds.',
  },

  {
    ...g('Wing settle'),
    ...SWITCH,
    id: 'owl.standing.shrug.on',
    label: 'Wing settle',
    value: 'inherit',
    note: 'The wings lift and settle, now and then; the lantern rises with its wing.',
  },
  {
    ...g('Wing settle'),
    ...AMOUNT,
    id: 'owl.standing.shrug.amount',
    label: 'Wing settle amount',
    value: 1,
    note: 'A multiple of the default: a 1 unit lift and a 4 degree opening.',
  },
  {
    ...g('Wing settle'),
    ...PERIOD,
    id: 'owl.standing.shrug.period',
    label: 'Wing settle period',
    value: 1,
    note: 'A multiple of the default mean gap of 17 seconds.',
  },

  {
    ...g('Lantern sway'),
    ...SWITCH,
    id: 'owl.standing.lantern-sway.on',
    label: 'Lantern sway',
    value: 'inherit',
    note: 'The lantern swings a little from its handle.',
  },
  {
    ...g('Lantern sway'),
    ...AMOUNT,
    id: 'owl.standing.lantern-sway.amount',
    label: 'Lantern sway amount',
    value: 1,
    note: 'A multiple of the default: 2.2 degrees each way.',
  },
  {
    ...g('Lantern sway'),
    ...PERIOD,
    id: 'owl.standing.lantern-sway.period',
    label: 'Lantern sway period',
    value: 1,
    note: 'A multiple of the default of 3.7 seconds a swing.',
  },

  {
    ...g('Drowsy lids'),
    ...SWITCH,
    id: 'owl.standing.drowsy.on',
    label: 'Drowsy lids',
    value: 'inherit',
    note: 'The lids sink slowly, hold, and snap back; the head dips with them. It stacks with the blink.',
  },
  {
    ...g('Drowsy lids'),
    ...AMOUNT,
    id: 'owl.standing.drowsy.amount',
    label: 'Drowsy lids amount',
    value: 1,
    note: 'A multiple of the default: the lids reach 55% of their height at the lowest.',
  },
  {
    ...g('Drowsy lids'),
    ...PERIOD,
    id: 'owl.standing.drowsy.period',
    label: 'Drowsy lids period',
    value: 1,
    note: 'A multiple of the default of 19 seconds a droop.',
  },

  {
    ...g('Double blink'),
    ...SWITCH,
    id: 'owl.standing.double-blink.on',
    label: 'Double blink',
    value: 'inherit',
    note: 'Now and then the owl blinks twice, quickly, on top of its ordinary blink.',
  },
  {
    ...g('Double blink'),
    ...AMOUNT,
    id: 'owl.standing.double-blink.amount',
    label: 'Double blink amount',
    value: 1,
    note: 'A multiple of the default speed: the pair takes about a third of a second. More is quicker.',
  },
  {
    ...g('Double blink'),
    ...PERIOD,
    id: 'owl.standing.double-blink.period',
    label: 'Double blink period',
    value: 1,
    note: 'A multiple of the default mean gap of 13 seconds.',
  },

  {
    ...g('Slow blink'),
    ...SWITCH,
    id: 'owl.standing.slow-blink.on',
    label: 'Slow blink',
    value: 'inherit',
    note: 'Now and then the lids close slowly, rest, and open slowly.',
  },
  {
    ...g('Slow blink'),
    ...AMOUNT,
    id: 'owl.standing.slow-blink.amount',
    label: 'Slow blink amount',
    value: 1,
    note: 'How far the lids go, as a share of the owl’s own blink: 1 closes them as far as the ordinary blink does.',
  },
  {
    ...g('Slow blink'),
    ...PERIOD,
    id: 'owl.standing.slow-blink.period',
    label: 'Slow blink period',
    value: 1,
    note: 'A multiple of the default mean gap of 22 seconds.',
  },

  {
    ...g('Idle glance'),
    ...SWITCH,
    id: 'owl.standing.glance.on',
    label: 'Idle glance',
    value: 'inherit',
    note: 'After the pointer has been still for five seconds the eyes wander off for a moment; they yield when it moves.',
  },
  {
    ...g('Idle glance'),
    ...AMOUNT,
    id: 'owl.standing.glance.amount',
    label: 'Idle glance amount',
    value: 1,
    note: 'How far the pupils go, as a multiple of the gaze’s own travel.',
  },
  {
    ...g('Idle glance'),
    ...PERIOD,
    id: 'owl.standing.glance.period',
    label: 'Idle glance period',
    value: 1,
    note: 'A multiple of the default mean gap of 9 seconds, counted from when the pointer has been still long enough.',
  },

  {
    ...g('Startle'),
    ...SWITCH,
    id: 'owl.standing.startle.on',
    label: 'Startle',
    value: 'inherit',
    note: 'A click or tap on the owl makes it hop and its eyes go wide.',
  },
  {
    ...g('Startle'),
    ...AMOUNT,
    id: 'owl.standing.startle.amount',
    label: 'Startle amount',
    value: 1,
    note: 'A multiple of the default: a 1.4 unit hop, eyes a tenth wider.',
  },
  {
    ...g('Startle'),
    ...PERIOD,
    id: 'owl.standing.startle.period',
    label: 'Startle length',
    value: 1,
    note: 'A multiple of the default half second the startle lasts.',
  },

  {
    ...g('Line boil'),
    ...SWITCH,
    id: 'owl.standing.boil.on',
    label: 'Line boil',
    value: 'inherit',
    note: 'The page re-seats on the glass a fraction of a unit about six times a second; the hatching drifts out of register. Stepped.',
  },
  {
    ...g('Line boil'),
    ...AMOUNT,
    id: 'owl.standing.boil.amount',
    label: 'Line boil amount',
    value: 1,
    note: 'A multiple of the default: up to 0.22 of a unit, and 0.3 for the hatching.',
  },
  {
    ...g('Line boil'),
    ...PERIOD,
    id: 'owl.standing.boil.period',
    label: 'Line boil period',
    value: 1,
    note: 'A multiple of the default 4 second cycle of 24 positions: a smaller number is a faster boil.',
  },

  {
    ...g('Hatching breath'),
    ...SWITCH,
    id: 'owl.standing.hatch-breath.on',
    label: 'Hatching breath',
    value: 'inherit',
    note: 'The cross-hatch deepens and lightens with the breath, in step with it. Engraved style only.',
  },
  {
    ...g('Hatching breath'),
    ...AMOUNT,
    id: 'owl.standing.hatch-breath.amount',
    label: 'Hatching breath amount',
    value: 1,
    note: 'A multiple of the default: the hatching falls to 55% of its ink at the bottom of the breath.',
  },
  {
    ...g('Hatching breath'),
    ...PERIOD,
    id: 'owl.standing.hatch-breath.period',
    label: 'Hatching breath period',
    value: 1,
    note: 'Left at 1 it keeps breathing’s own pace; moved, it breathes at its own, 5.3 seconds times this.',
  },

  {
    ...g('Flame flicker'),
    ...SWITCH,
    id: 'owl.standing.flicker.on',
    label: 'Flame flicker',
    value: 'inherit',
    note: 'The flame shivers; a lit lantern’s rays and glow gutter a little. Stepped.',
  },
  {
    ...g('Flame flicker'),
    ...AMOUNT,
    id: 'owl.standing.flicker.amount',
    label: 'Flame flicker amount',
    value: 1,
    note: 'A multiple of the default: the flame varies by about 15%, the rays by up to 45%.',
  },
  {
    ...g('Flame flicker'),
    ...PERIOD,
    id: 'owl.standing.flicker.period',
    label: 'Flame flicker period',
    value: 1,
    note: 'A multiple of the default 1.8 second cycle of 16 steps: a smaller number is a faster flicker.',
  },

  {
    ...g('Toner flicker'),
    ...SWITCH,
    id: 'owl.standing.toner.on',
    label: 'Toner flicker',
    value: 'inherit',
    note: 'The ink density varies by region from step to step. Stepped.',
  },
  {
    ...g('Toner flicker'),
    ...AMOUNT,
    id: 'owl.standing.toner.amount',
    label: 'Toner flicker amount',
    value: 1,
    note: 'A multiple of the default: a region loses up to 14% of its ink at a step.',
  },
  {
    ...g('Toner flicker'),
    ...PERIOD,
    id: 'owl.standing.toner.period',
    label: 'Toner flicker period',
    value: 1,
    note: 'A multiple of the default 3.4 second cycle of 17 steps.',
  },

  {
    ...g('Light bar'),
    ...SWITCH,
    id: 'owl.standing.light-bar.on',
    label: 'Light bar',
    value: 'inherit',
    note: 'A copier’s band of light crosses the figure, stepping, now and then.',
  },
  {
    ...g('Light bar'),
    ...AMOUNT,
    id: 'owl.standing.light-bar.amount',
    label: 'Light bar amount',
    value: 1,
    note: 'A multiple of the default: a 16 unit band at about 85% at its centre.',
  },
  {
    ...g('Light bar'),
    ...PERIOD,
    id: 'owl.standing.light-bar.period',
    label: 'Light bar period',
    value: 1,
    note: 'A multiple of the default mean gap of 29 seconds.',
  },
])
