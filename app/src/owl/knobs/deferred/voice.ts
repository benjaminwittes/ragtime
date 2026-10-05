import { defineTunables } from '@/tune/registry'
import { treatmentOptions } from '../../voice/treatments'

/**
 * The rest of the owl's voice: how a line is set, how long it takes about it, and which
 * occasions are switched on. Same rule as the other groups: the `value:` here is the only
 * copy of each default. `../voice.ts` has the two knobs a page without a voice still reads.
 *
 * Deferred (`./index.ts` says what that is): the speech code imports this file
 * (`voice/config.ts`), so the defaults arrive with the code that reads them.
 */

const SELF = 'src/owl/knobs/deferred/voice.ts'

const VOICE = { scope: 'owl', group: 'Voice', source: { file: SELF } } as const
const WHEN = { scope: 'owl', group: 'Voice: occasions', source: { file: SELF }, kind: 'boolean' } as const

export const owlVoiceDetailKnobs = defineTunables([
  {
    ...VOICE,
    id: 'owl.voice.treatment',
    label: 'Treatment',
    kind: 'select',
    value: 'voice',
    options: treatmentOptions(),
    note: 'How a line is set on the page. “follow the voice” uses the treatment each voice names.',
  },
  {
    ...VOICE,
    id: 'owl.voice.delay',
    label: 'Delay before speaking',
    kind: 'int',
    value: 600,
    min: 0,
    max: 5000,
    step: 100,
    note: 'Milliseconds from the occasion to the first letter. A newer occasion in that time replaces the one waiting.',
  },
  {
    ...VOICE,
    id: 'owl.voice.dwell',
    label: 'Dwell',
    kind: 'int',
    value: 6000,
    min: 1500,
    max: 20000,
    step: 500,
    note: 'Milliseconds a line stays once it is up. A click on the owl, or Escape, takes it down sooner.',
  },
  {
    ...VOICE,
    id: 'owl.voice.typeMs',
    parent: 'owl.voice.speak',
    label: 'Type speed',
    kind: 'int',
    user: true,
    value: 16,
    min: 0,
    max: 120,
    step: 4,
    note: 'Milliseconds per letter. 0 puts the line up whole. A reader who has asked for reduced motion always gets the whole line.',
  },
  {
    ...VOICE,
    id: 'owl.voice.once',
    label: 'Once per session',
    kind: 'boolean',
    value: false,
    note: 'Each occasion is said at most once per voice until the tab is closed. Off, the owl speaks every time. Idle and clicked lines are never counted.',
  },
  {
    ...VOICE,
    id: 'owl.voice.poke',
    label: 'Speaks when clicked',
    kind: 'boolean',
    value: true,
    note: 'A click or tap on the owl says a line, or takes down the one that is up. A pointer affordance only: it adds nothing to the keyboard or to assistive technology.',
  },
  {
    ...VOICE,
    id: 'owl.voice.idleSeconds',
    label: 'Idle interval',
    kind: 'int',
    value: 45,
    min: 10,
    max: 600,
    step: 5,
    note: 'Seconds with no pointer, key or scroll before an idle line. It then waits as long again.',
  },

  {
    ...WHEN,
    id: 'owl.voice.on.arrive-hub',
    label: 'Hub: arrives',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.arrive-gate',
    label: 'Gate: arrives',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.explorer-empty',
    label: 'Explorer: empty',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.stage-quiet',
    label: 'Stage: nobody presenting',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.not-found',
    label: 'Not found',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.searching',
    label: 'A search is out',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.search-empty',
    label: 'Search came back empty',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.search-results',
    label: 'Search came back',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.working',
    label: 'Explorer: working',
    value: true,
    note: 'Only where the chat switch below has put the owl in the conversation.',
  },
  {
    ...WHEN,
    id: 'owl.voice.on.answered',
    label: 'Explorer: answered',
    value: true,
    note: 'Only where the chat switch below has put the owl in the conversation.',
  },
  {
    ...WHEN,
    id: 'owl.voice.on.wrong-code',
    label: 'Gate: wrong code',
    value: true,
  },
  {
    ...WHEN,
    id: 'owl.voice.on.night',
    label: 'After dark',
    value: true,
    note: 'At a site that keeps hours, a line about the lit lantern in place of the arrival line.',
  },
  {
    ...WHEN,
    id: 'owl.voice.on.idle',
    label: 'Long idle',
    value: true,
  },
])
