import { defineSurface } from '@/tune/registry'

/**
 * What the owl exposes to the tuning panel — and the place a later builder adds to it
 * without touching this file.
 *
 * Every `*.ts` file next to this one is a knob group and is loaded by the glob below:
 *
 *   `design.ts`    the look: palette, strokes, shapes, the render style
 *   `motion.ts`    the behaviour: timings, gaze, the night hours
 *   `embeds.ts`    the placement: the variant, and each site's size and variant
 *
 * To add a group — engraving, standing behaviours, voice — add a file here that calls
 * `defineTunables` with `scope: 'owl'`. Knob ids that begin `owl.design.` are paths into
 * the design (`design.ts` at the owl root says how); anything else is read with
 * `useTunable`. Nothing else needs to know the file exists.
 *
 * The groups are loaded for their side effect, in a block, because the declarations
 * carry the defaults production runs on: `../design.ts` imports this module, so they
 * ship (see `src/tune/registry.ts`). `src/tune/knobs.ts` imports it too, for the panel.
 */

export const owlSurface = defineSurface({
  id: 'owl',
  label: 'Owl',
  // On screen whenever an owl is. The lab (`/owl-lab`) is made of them.
  selector: '.owl',
  file: 'src/owl/knobs/design.ts',
})

import.meta.glob(['./*.ts', '!./index.ts', '!./*.test.ts'], { eager: true })
