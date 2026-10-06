import { describeTunables } from '@/tune/registry'
import '../user'

/**
 * What the gear and the panel draw for each knob in `../user.ts`: its label, group, kind and
 * note. Each is `user: true`, so a reader sees it in a production build. Loaded only with the
 * panel and the gear (`../all.ts`).
 */

const SELF = 'src/owl/knobs/user.ts'

const OWL = { scope: 'owl', group: 'The owl', source: { file: SELF }, user: true } as const

describeTunables([
  {
    ...OWL,
    id: 'owl.show',
    label: 'Show the owl',
    kind: 'boolean',
    note: 'The owl on the first screen, the gate, the Explorer and the empty states. Off, it is gone and the page keeps its place.',
  },
  {
    ...OWL,
    id: 'owl.lines.motion',
    parent: 'owl.show',
    label: 'Owl motion',
    kind: 'select',
    options: [
      { label: 'Still', value: 'still' },
      { label: 'Calm', value: 'calm' },
      { label: 'Lively', value: 'lively' },
    ],
    note: 'How much the line-tile owl moves: blink and breath, and the ink and the page shifting a little. Still draws it once. A reader who has asked for reduced motion always gets it still.',
  },
])
