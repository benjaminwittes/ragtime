import type { OwlStanding } from '../types'
import { EASE, n } from './core/frames'

/**
 * Toner flicker: the ink laid down is never quite even, so each region's line screen
 * lightens by a different small amount from one step to the next, about five times a
 * second. In the flat style, where there is no screen, each part of the figure does it.
 *
 * It is stepped by nature, like the boil, and only ever lightens, so a region is at its
 * full ink most of the time.
 *
 * The cycle is 17 steps, a prime, so that the regions' sequences, which are all this long,
 * are never in step with the boil's 24. Its period is the cycle's length: 3.4 seconds is
 * five steps a second.
 *
 * At amount 1 a region loses up to 14% of its ink at a step.
 */

const STEPS = 17

export default {
  id: 'toner',
  label: 'Toner flicker',
  note: 'The ink density varies by region from step to step, five times a second.',
  period: 3.4,
  start(ctx) {
    const screens = ctx.all('.eng-lines')
    const targets = screens.length > 0 ? screens : (['body', 'head', 'belly', 'wing-l', 'wing-r'] as const)
    for (const target of targets) {
      const draws = Array.from({ length: STEPS }, () => ctx.rng())
      ctx.loop(
        target,
        ({ amount: a }) =>
          Array.from({ length: STEPS + 1 }, (_, i) => ({
            offset: i / STEPS,
            easing: EASE.step,
            opacity: n(-0.14 * a * draws[i % STEPS]),
          })),
        { own: true },
      )
    }
  },
} satisfies OwlStanding
