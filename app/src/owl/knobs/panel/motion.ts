import { describeTunables } from '@/tune/registry'
import '../motion'

/**
 * What the panel draws for each knob in `../motion.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/motion.ts'

const LANTERN = { scope: 'owl', group: 'Lantern', source: { file: SELF } } as const

describeTunables([
  {
    ...LANTERN,
    id: 'owl.design.night.from',
    label: 'Night begins',
    kind: 'int',
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
    min: 0,
    max: 23,
    step: 1,
    note: 'And the hour it puts it out. A window that ends before it begins wraps midnight.',
  },
])
