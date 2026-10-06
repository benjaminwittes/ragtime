import { describeTunables } from '@/tune/registry'
import '../embeds'

/**
 * What the panel draws for each knob in `../embeds.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/embeds.ts'

const SIZE = { scope: 'owl', group: 'Sites', source: { file: SELF } } as const

describeTunables([

  {
    ...SIZE,
    id: 'owl.embed.hub.size',
    label: 'Hub: size',
    kind: 'length',
    units: ['rem'],
    min: 2,
    max: 20,
    step: 0.25,
    note: 'Width on a phone. From the sm breakpoint the next knob applies.',
  },
  {
    ...SIZE,
    id: 'owl.embed.hub.sizeSm',
    label: 'Hub: size from sm up',
    kind: 'length',
    units: ['rem'],
    min: 2,
    max: 20,
    step: 0.25,
  },

  {
    ...SIZE,
    id: 'owl.embed.explorer.size',
    label: 'Explorer: size',
    kind: 'length',
    units: ['px'],
    min: 24,
    max: 192,
    step: 2,
  },

  {
    ...SIZE,
    id: 'owl.embed.gate.size',
    label: 'Access gate: size',
    kind: 'length',
    units: ['rem'],
    min: 2,
    max: 16,
    step: 0.25,
  },

  {
    ...SIZE,
    id: 'owl.embed.not-found.size',
    label: 'Not found: size',
    kind: 'length',
    units: ['rem'],
    min: 2,
    max: 16,
    step: 0.25,
  },

  {
    ...SIZE,
    id: 'owl.embed.stage.size',
    label: 'Stage, empty: size',
    kind: 'length',
    units: ['rem'],
    min: 2,
    max: 20,
    step: 0.25,
  },

  {
    ...SIZE,
    id: 'owl.embed.record.size',
    label: 'Record stage: size',
    kind: 'text',
    note: 'A CSS width, because it scales with the stage: cqi is a share of the stage’s own width.',
  },
])
