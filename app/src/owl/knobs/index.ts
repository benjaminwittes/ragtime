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
 *   `voice.ts`     whether the owl speaks, and in which voice
 *
 * To add a group, add a file here that calls `defineTunables` with `scope: 'owl'`. Knob ids
 * that begin `owl.design.` are paths into the design (`design.ts` at the owl root says how);
 * anything else is read with `useTunable`. Nothing else needs to know the file exists. A
 * group that only an off-by-default feature reads is not added here but in `deferred/`, below.
 *
 * The groups are loaded for their side effect, in a block, because the declarations
 * carry the defaults production runs on: `../design.ts` imports this module, so they
 * ship (see `src/tune/registry.ts`).
 *
 * **Deferred groups.** A group whose declarations nothing reads in a build without the
 * panel, or only the code of one off-by-default feature reads, goes in `deferred/` instead.
 * Those are not loaded here, so they are not in the page that carries the owl:
 *
 *   `deferred/standing.ts`   the standing behaviours' switches, amounts and periods: resolved
 *                            from tuned values only, so the declared defaults decide nothing
 *   `deferred/engraved.ts`   the engraved style's halftone: imported by the style, so it
 *                            arrives with the code that reads it
 *   `deferred/voice.ts`      the voice's treatment, timings and occasions: imported by the
 *                            speech code. `voice.ts` here keeps the two knobs a page without
 *                            a voice reads
 *
 * `all.ts` loads every group, which is what the panel imports (`src/tune/knobs.ts`), and puts
 * the knobs in the order the panel lists them in: file-name order, as when they were one glob.
 * A deferred group a feature reads for its defaults imports its own file, as the engraved
 * style does.
 */

export const owlSurface = defineSurface({
  id: 'owl',
  label: 'Owl',
  // On screen whenever an owl is. The lab (`/owl-lab`) is made of them.
  selector: '.owl',
  file: 'src/owl/knobs/design.ts',
})

import.meta.glob(['./*.ts', '!./index.ts', '!./all.ts', '!./*.test.ts'], { eager: true })
