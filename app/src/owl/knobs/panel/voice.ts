import { describeTunables } from '@/tune/registry'
import '../voice'
import { voiceOptions } from '../../voice'

/**
 * What the panel draws for each knob in `../voice.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/voice.ts'

const VOICE = { scope: 'owl', group: 'Voice', source: { file: SELF } } as const
const CHAT = { scope: 'owl', group: 'Voice: chat', source: { file: SELF } } as const

describeTunables([
  {
    ...VOICE,
    id: 'owl.voice.id',
    label: 'Voice',
    kind: 'select',
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
    options: [
      { label: 'off', value: 'off' },
      { label: 'working row', value: 'row' },
    ],
    note: 'Experimental. “working row” puts a small owl in the conversation: in place of the mark while a turn is working, and at the foot of the last answer once it has landed. Off, the conversation is exactly what it was.',
  },
])
