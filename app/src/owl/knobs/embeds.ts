import { defineTunables } from '@/tune/registry'
import { variantOptions } from '../variants'

/**
 * How the owl is placed: which variant wears it, and the size at each site.
 *
 * These are not paths into the design, so their ids do not begin `owl.design.`; the
 * placement code reads them with `useTunable` (`embeds.ts` at the owl root names which
 * id belongs to which site). A size is the width as a CSS length, set on whatever
 * element carries the width at that site as `--owl-size`.
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

export const owlEmbedKnobs = defineTunables([
  {
    ...GLOBAL,
    id: 'owl.variant',
    label: 'Active variant',
    kind: 'select',
    value: 'base',
    options: variantOptions(),
    note: 'Applies to every owl that has no variant of its own. Knobs you move below still win over it.',
  },

  {
    ...SIZE,
    id: 'owl.embed.hub.size',
    label: 'Hub: size',
    kind: 'length',
    value: '5.5rem',
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
    value: '7rem',
    units: ['rem'],
    min: 2,
    max: 20,
    step: 0.25,
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.hub.variant',
    label: 'Hub: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.explorer.size',
    label: 'Explorer: size',
    kind: 'length',
    value: '56px',
    units: ['px'],
    min: 24,
    max: 192,
    step: 2,
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.explorer.variant',
    label: 'Explorer: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.gate.size',
    label: 'Access gate: size',
    kind: 'length',
    value: '4rem',
    units: ['rem'],
    min: 2,
    max: 16,
    step: 0.25,
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.gate.variant',
    label: 'Access gate: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.not-found.size',
    label: 'Not found: size',
    kind: 'length',
    value: '5rem',
    units: ['rem'],
    min: 2,
    max: 16,
    step: 0.25,
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.not-found.variant',
    label: 'Not found: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.stage.size',
    label: 'Stage, empty: size',
    kind: 'length',
    value: '6rem',
    units: ['rem'],
    min: 2,
    max: 20,
    step: 0.25,
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.stage.variant',
    label: 'Stage, empty: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },

  {
    ...SIZE,
    id: 'owl.embed.record.size',
    label: 'Record stage: size',
    kind: 'text',
    value: 'clamp(3rem,5.2cqi,4.75rem)',
    note: 'A CSS width, because it scales with the stage: cqi is a share of the stage’s own width.',
  },
  {
    ...PER_SITE_VARIANT,
    id: 'owl.embed.record.variant',
    label: 'Record stage: variant',
    value: 'inherit',
    options: [inherit, ...variantOptions()],
  },
])
