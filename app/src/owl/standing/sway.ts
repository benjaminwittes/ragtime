import type { OwlStanding } from '../types'
import { cycle, n } from './core/frames'

/**
 * A weight shift: the whole figure leans a little to one side and back, about its feet,
 * and takes the head, the wings and the lantern with it. The motion is a slow sine with a
 * second, smaller one on it so that the lean is not quite the same each way.
 *
 * At amount 1 the lean is 0.7 degrees and 0.35 of a unit sideways: the top of the head
 * moves about three-quarters of a unit.
 */
export default {
  id: 'sway',
  label: 'Weight shift',
  note: 'A slow lean from one foot to the other, the whole figure about its base.',
  period: 11.3,
  start(ctx) {
    ctx.loop('figure', ({ amount: a }) =>
      cycle((t) => {
        const w = Math.sin(t * Math.PI * 2) + 0.3 * Math.sin(t * Math.PI * 4 + 1)
        return { transform: `translateX(${n(0.3 * a * w)}px) rotate(${n(0.65 * a * w)}deg)` }
      }, 24),
    )
  },
} satisfies OwlStanding
