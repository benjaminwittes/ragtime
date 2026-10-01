import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'

/**
 * An occasional head tilt, with a turn in it: the head cants to one side about the neck, a
 * little to the side it leans, and the face (eyes, rims, lids, beak) slides further than
 * the outline does, which reads as the head having turned. It holds for a moment and
 * comes back. It leans the other way more often than not, and never the same way three
 * times.
 *
 * At amount 1 the tilt is 3.2 degrees and the face slides 1.1 units.
 */
export default {
  id: 'tilt',
  label: 'Head tilt',
  note: 'Now and then the head cants to one side, and the face turns a little further than the outline.',
  period: 14,
  start(ctx) {
    let side = ctx.rng() < 0.5 ? -1 : 1
    let run = 0
    ctx.every(() => {
      const a = ctx.config.amount
      const flip = ctx.rng() < 0.7 || run >= 2
      side = flip ? -side : side
      run = flip ? 0 : run + 1
      const hold = 1400 + ctx.rng() * 1600
      const lean = track([
        [0, { transform: 'rotate(0deg) translateX(0px)' }, EASE.out],
        [650, { transform: `rotate(${side * 3.2 * a}deg) translateX(${side * 0.45 * a}px)` }, 'linear'],
        [650 + hold, { transform: `rotate(${side * 3.2 * a}deg) translateX(${side * 0.45 * a}px)` }, EASE.inOut],
        [650 + hold + 900, { transform: 'rotate(0deg) translateX(0px)' }],
      ])
      const turn = track([
        [0, { transform: 'translateX(0px)' }, EASE.out],
        [650, { transform: `translateX(${side * 1.1 * a}px)` }, 'linear'],
        [650 + hold, { transform: `translateX(${side * 1.1 * a}px)` }, EASE.inOut],
        [650 + hold + 900, { transform: 'translateX(0px)' }],
      ])
      void ctx.gesture(['head'], lean.frames, { duration: lean.duration })
      void ctx.gesture(['features'], turn.frames, { duration: turn.duration })
    })
  },
} satisfies OwlStanding
