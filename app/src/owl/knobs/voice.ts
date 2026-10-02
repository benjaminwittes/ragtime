import { defineTunables } from '@/tune/registry'
import { voiceOptions } from '../voice'

/**
 * The owl's voice, the two knobs a page that has no voice still reads: which voice speaks,
 * and whether the owl is called into the Explorer's conversation. Same rule as the other
 * groups: the `value:` here is the only copy of each default. Voice is none and the chat
 * switch is off, so with nothing tuned the owl says nothing and the page is the page it was.
 *
 * The rest of the voice's knobs (the treatment, the timings, the occasions) are in
 * `deferred/voice.ts`: only the speech code reads them, so they arrive with it.
 *
 * None of these is a path into the design (the ids do not begin `owl.design.`): the
 * speech code reads them through the store (`voice/config.ts`).
 */

const SELF = 'src/owl/knobs/voice.ts'

const VOICE = { scope: 'owl', group: 'Voice', source: { file: SELF } } as const
const CHAT = { scope: 'owl', group: 'Voice: chat', source: { file: SELF } } as const

export const owlVoiceKnobs = defineTunables([
  {
    ...VOICE,
    id: 'owl.voice.id',
    label: 'Voice',
    kind: 'select',
    value: 'none',
    // Read when the panel draws the knob, not when this file loads: `voiceOptions` lists the
    // voices that are loaded, and the panel has loaded them all by then (`./all.ts`).
    get options() {
      return voiceOptions()
    },
    note: 'Who speaks. None is the default, and with none the owl is silent. A variant can name a voice of its own; a voice picked here wins over it.',
  },

  {
    ...CHAT,
    id: 'owl.voice.chat',
    label: 'Owl in the Explorer conversation',
    kind: 'select',
    value: 'off',
    options: [
      { label: 'off', value: 'off' },
      { label: 'working row', value: 'row' },
    ],
    note: 'Experimental. “working row” puts a small owl in the conversation: in place of the mark while a turn is working, and at the foot of the last answer once it has landed. Off, the conversation is exactly what it was.',
  },
])
