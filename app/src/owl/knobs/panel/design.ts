import { describeTunables } from '@/tune/registry'
import '../design'
import { styleOptions } from '../../styles'

/**
 * What the panel draws for each knob in `../design.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/design.ts'

const STYLE = { scope: 'owl', group: 'Look', source: { file: SELF } } as const

const PALETTE = { scope: 'owl', group: 'Palette', kind: 'color', source: { file: SELF } } as const

describeTunables([
  {
    ...STYLE,
    id: 'owl.design.style',
    label: 'Render style',
    kind: 'select',
    options: styleOptions(),
    note: 'How the body is drawn. The eyes, the gaze and the lantern state are the same in every style.',
  },

  {
    ...PALETTE,
    id: 'owl.design.palette.navy',
    label: 'Navy',
    note: 'The body, the head, the lantern frame and the book rims.',
  },
])
