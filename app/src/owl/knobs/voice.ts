import { defineTunables } from '@/tune/registry'

/**
 * The owl's voice, the two knobs a page that has no voice still reads: which voice speaks,
 * and whether the owl is called into the Explorer's conversation. Same rule as the other
 * groups: the `value:` here is the only copy of each default. Voice is none and the chat
 * switch is off, so with nothing tuned the owl says nothing and the page is the page it was.
 *
 * The rest of the voice's knobs (the treatment, the timings, the occasions) are in
 * `deferred/voice.ts`: only the speech code reads them, so they arrive with it. The panel's
 * labels and notes for these two are in `panel/voice.ts`.
 *
 * None of these is a path into the design (the ids do not begin `owl.design.`): the
 * speech code reads them through the store (`voice/config.ts`).
 */

export const owlVoiceKnobs = defineTunables([
  {
    id: 'owl.voice.id',
    value: 'none',
  },

  {
    id: 'owl.voice.chat',
    value: 'off',
  },

  {
    // The reader's switch: off, no owl speaks, whatever voice a variant or the panel names.
    id: 'owl.voice.speak',
    value: true,
  },
])
