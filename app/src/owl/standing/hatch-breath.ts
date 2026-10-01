import type { OwlStanding } from '../types'
import { cycle, n, swell } from './core/frames'

/**
 * The cross-hatch deepens and lightens with the breath: fullest at the top of the
 * in-breath, thinning as the owl lets it out. It keeps breathing's own pace and phase
 * when breathing is on, so the shading and the chest are one breath; without breathing it
 * runs on its own, at the same default period. Engraved style only: there is no hatching
 * in the flat one, and nothing to do.
 *
 * At amount 1 the hatching falls to 55% of its ink at the bottom of the breath.
 */
export default {
  id: 'hatch-breath',
  label: 'Hatching breath',
  note: 'The cross-hatch deepens and lightens with the breath, in step with it.',
  // The same as breathing's, which is what keeps the two in step: one is a multiple of the other's.
  period: 5.3,
  start(ctx) {
    const hatch = ctx.all('.eng-hatch')
    ctx.loop(hatch, ({ amount: a }) => cycle((t) => ({ opacity: n(-0.45 * Math.min(a, 2) * (1 - swell(t))) })), {
      phase: ctx.phase('breathe'),
      paceOf: 'breathe',
    })
  },
} satisfies OwlStanding
