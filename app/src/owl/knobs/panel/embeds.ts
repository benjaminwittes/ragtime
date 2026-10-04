import { describeTunables } from '@/tune/registry'
import '../embeds'
import { variantOptions } from '../../variants'

/**
 * What the panel draws for each knob in `../embeds.ts`: its label, group, kind, range and note.
 * Loaded only with the panel (`../all.ts`), so none of it is in a production page.
 */

const SELF = 'src/owl/knobs/embeds.ts'

const GLOBAL = { scope: 'owl', group: 'Variant', source: { file: SELF } } as const
const SIZE = { scope: 'owl', group: 'Sites', source: { file: SELF } } as const

const PER_SITE_VARIANT = {
  ...SIZE,
  kind: 'select',
  note: 'Overrides the variant for this site alone. “inherit” follows the site’s table entry, then the variant above.',
} as const

const inherit = { label: 'inherit', value: 'inherit' } as const

describeTunables([
  {
    ...GLOBAL,
    id: 'owl.variant',
    label: 'Active variant',
    kind: 'select',
    options: variantOptions(),
    note: 'Applies to every owl that has no variant of its own. Knobs you move below still win over it.',
  },

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
    ...PER_SITE_VARIANT,
    id: 'owl.embed.hub.variant',
    label: 'Hub: variant',
    options: [inherit, ...variantOptions()],
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
    ...PER_SITE_VARIANT,
    id: 'owl.embed.explorer.variant',
    label: 'Explorer: variant',
    options: [inherit, ...variantOptions()],
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
    ...PER_SITE_VARIANT,
    id: 'owl.embed.gate.variant',
    label: 'Access gate: variant',
    options: [inherit, ...variantOptions()],
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
    ...PER_SITE_VARIANT,
    id: 'owl.embed.not-found.variant',
    label: 'Not found: variant',
    options: [inherit, ...variantOptions()],
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
    ...PER_SITE_VARIANT,
    id: 'owl.embed.stage.variant',
    label: 'Stage, empty: variant',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.record.size',
    label: 'Record stage: size',
    kind: 'text',
    note: 'A CSS width, because it scales with the stage: cqi is a share of the stage’s own width.',
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.record.variant',
    label: 'Record stage: variant',
    options: [inherit, ...variantOptions()],
  },
])
