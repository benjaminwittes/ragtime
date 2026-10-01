import type { OwlStanding } from '../types'
import { cycle, n, swell } from './core/frames'

/**
 * Breathing: the torso fills, the belly swells, and what rides on them — the head, the
 * wings, the lantern — rises with the chest. One cycle is one breath, and every part
 * shares its phase so the owl swells as one body and not as five.
 *
 * At amount 1 the torso is 1.4% wider and 1% taller at the top of the breath, which is
 * about half a figure unit at the shoulders: under a pixel at an embed size, a pixel and a
 * half at 320, and something you notice only if you stop reading and look.
 */
export default {
  id: 'breathe',
  label: 'Breathing',
  note: 'The chest fills and the belly swells, slowly; the head and wings rise with it.',
  period: 5.3,
  start(ctx) {
    ctx.loop('body', ({ amount: a }) =>
      cycle((t) => ({ transform: `scale(${n(1 + 0.014 * a * swell(t))}, ${n(1 + 0.01 * a * swell(t))})` })),
    )
    ctx.loop('belly', ({ amount: a }) =>
      cycle((t) => ({ transform: `scale(${n(1 + 0.05 * a * swell(t))}, ${n(1 + 0.04 * a * swell(t))})` })),
    )
    // What stands on the chest rises as far as the chest does at that height.
    ctx.loop('head', ({ amount: a }) => cycle((t) => ({ transform: `translateY(${n(-0.5 * a * swell(t))}px)` })))
    ctx.loop(['wing-l', 'wing-r', 'lantern'], ({ amount: a }) =>
      cycle((t) => ({ transform: `translateY(${n(-0.28 * a * swell(t))}px)` })),
    )
  },
} satisfies OwlStanding
