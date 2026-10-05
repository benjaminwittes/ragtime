import { defineTunables } from '@/tune/registry'

/**
 * How the owl is placed: which variant wears it, and the size at each site.
 *
 * These are not paths into the design, so their ids do not begin `owl.design.`; the
 * placement code reads them with `useTunable` (`embeds.ts` at the owl root names which
 * id belongs to which site). A size is the width as a CSS length, set on whatever
 * element carries the width at that site as `--owl-size`. The panel's labels, ranges and
 * notes are in `panel/embeds.ts`.
 */

export const owlEmbedKnobs = defineTunables([
  {
    id: 'owl.variant',
    value: 'lines',
  },

  {
    id: 'owl.embed.hub.size',
    value: '5.5rem',
  },
  {
    id: 'owl.embed.hub.sizeSm',
    value: '7rem',
  },
  {
    id: 'owl.embed.hub.variant',
    value: 'inherit',
  },

  {
    id: 'owl.embed.explorer.size',
    value: '56px',
  },
  {
    id: 'owl.embed.explorer.variant',
    value: 'inherit',
  },

  {
    id: 'owl.embed.gate.size',
    value: '4rem',
  },
  {
    id: 'owl.embed.gate.variant',
    value: 'inherit',
  },

  {
    id: 'owl.embed.not-found.size',
    value: '5rem',
  },
  {
    id: 'owl.embed.not-found.variant',
    value: 'inherit',
  },

  {
    id: 'owl.embed.stage.size',
    value: '6rem',
  },
  {
    id: 'owl.embed.stage.variant',
    value: 'inherit',
  },

  {
    id: 'owl.embed.record.size',
    value: 'clamp(3rem,5.2cqi,4.75rem)',
  },
  {
    id: 'owl.embed.record.variant',
    value: 'inherit',
  },
])
