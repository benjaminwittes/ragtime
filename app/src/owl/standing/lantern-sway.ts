import type { OwlStanding } from '../types'
import { cycle, n } from './core/frames'

/**
 * The lantern swings a little from its handle, like something hung from a hand that is
 * not quite still. A slow pendulum with a quicker, smaller one on it.
 *
 * At amount 1 it swings 2.2 degrees each way: the bottom of the frame travels about half
 * a unit.
 */
export default {
  id: 'lantern-sway',
  label: 'Lantern sway',
  note: 'The lantern swings a little from its handle.',
  period: 3.7,
  start(ctx) {
    ctx.loop('lantern', ({ amount: a }) =>
      cycle((t) => {
        const w = Math.sin(t * Math.PI * 2) + 0.25 * Math.sin(t * Math.PI * 6 + 0.8)
        return { transform: `rotate(${n(2.2 * a * w)}deg)` }
      }, 24),
    )
  },
} satisfies OwlStanding
