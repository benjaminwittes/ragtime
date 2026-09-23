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
 *
 * ---------------------------------------------------------------------------
 * The variants below take the *live page* as the baseline (2026-09-16), which
 * is what makes them worth having: the hand ports in `spikes/explorer-mockups`
 * (A, B, C) were built from the pre-merge Explorer clone and have drifted
 * behind the branch, so comparing against them now compares against the past.
 * A preset cannot drift — it is a delta on whatever the page currently is.
 *
 * Baseline is the page with no preset, and every knob left out of a preset sits
 * at its declared default. Each group below is a pair that brackets the
 * baseline rather than a single "better" — the point is to see the middle by
 * seeing both sides of it.
 */

import type { TunePresets } from './store'

export const repoPresets: TunePresets = {
  /* ---- Density: how much of the first screen clears a 390px fold --------- */
  compact: {
    'explorer.baseSize': '13.5px',
    'explorer.padX': '14px',
    'explorer.padY': '12px',
    'explorer.radius': '6px',
    'explorer.bubbleIndent': '8%',
  },
  roomy: {
    'explorer.baseSize': '16.5px',
    'explorer.padX': '28px',
    'explorer.padY': '26px',
    'explorer.radius': '10px',
    'explorer.bubbleIndent': '18%',
  },

  /* ---- Fork 4: what the Explorer looks like speaking the kit's language ---
   * Narrower than it sounds, and that is the finding. The kit's `--radius` is
   * 0.5rem — 8px — which is already the Explorer's control radius exactly, so
   * the shape half of fork 4 is converged and there is nothing to argue. What
   * is left is the type scale (the kit sits on Tailwind's 16px base, the
   * Explorer chose 15px) and the card corner (shadcn's Card is `rounded-xl`,
   * calc(--radius * 1.4) = 0.7rem, against the Explorer's 12px). Both are
   * written here in the kit's own units on purpose: a preset that says `8px`
   * where the kit says `0.5rem` would answer the question in the wrong
   * language and hide the fact that one of them tracks a token.
   */
  'kit-port': {
    'explorer.baseSize': '16px',
    'explorer.radius': '0.5rem',
    'explorer.accent': 'var(--primary)',
  },

  /* ---- The first screen as a lede ----------------------------------------
   * `exampleCount` is a runtime knob, not a custom property, so these two
   * change what renders rather than how it looks — which is the only honest
   * way to ask whether the empty state owes the reader three worked examples.
   */
  lede: {
    'explorer.emptyMeasure': '56ch',
    'explorer.exampleCount': 1,
  },
  bare: {
    'explorer.emptyMeasure': '52ch',
    'explorer.exampleCount': 0,
  },

  /* ---- The desktop split, while the trail is open ------------------------
   * Only reachable with a conversation on screen, since the Trail button does
   * not exist before there is a trail to show.
   */
  'trail-even': {
    'explorer.trailLeft': '1fr',
    'explorer.trailMin': '380px',
  },
  'trail-slim': {
    'explorer.trailLeft': '2.2fr',
    'explorer.trailMin': '240px',
  },
}
