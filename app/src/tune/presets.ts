/**
 * Committed tunings.
 *
 * A preset is a named set of knob values. Saving one in the panel keeps it in
 * this browser; committing one writes it here, where it is a normal file in the
 * repo — reviewable in a diff, openable by anyone on the branch, and nameable
 * in a URL (`#tune=<name>`) so the screenshot rig can shoot it.
 *
 * Rewritten wholesale by the dev middleware on "Commit preset"
 * (`app/vite-plugin-tune.ts`). Hand-editing is fine — it is just data — but
 * expect the panel to reformat it. Imported only by the panel, which is itself
 * loaded only when tuning is enabled, so this never reaches a production build.
 */

import type { TunePresets } from './store'

export const repoPresets: TunePresets = {}
