import { describeTunables } from '@/tune/registry'
import '../design'

/**
 * What the panel draws for each knob in `../design.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/design.ts'

const PALETTE = { scope: 'owl', group: 'Palette', kind: 'color', source: { file: SELF } } as const

describeTunables([

  {
    ...PALETTE,
    id: 'owl.design.palette.navy',
    label: 'Navy',
    note: 'The body, the head, the lantern frame and the book rims.',
  },
])
