import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'

/**
 * A feather settle: the wings lift, open a little and drop back past where they were and
 * rest. The wing that holds the lantern takes the lantern up with it.
 *
 * At amount 1 the wings rise 1 unit and open 4 degrees.
 */
export default {
  id: 'shrug',
  label: 'Wing settle',
  note: 'The wings lift and settle, now and then; the lantern rises with its wing.',
  period: 17,
  start(ctx) {
    ctx.every(() => {
      const a = ctx.config.amount
      const wing = (open: number) =>
        track([
          [0, { transform: 'translateY(0px) rotate(0deg)' }, EASE.out],
          [280, { transform: `translateY(${-1 * a}px) rotate(${open * 4 * a}deg)` }, 'linear'],
          [560, { transform: `translateY(${-0.9 * a}px) rotate(${open * 3.6 * a}deg)` }, EASE.inOut],
          [980, { transform: `translateY(${0.2 * a}px) rotate(${open * -0.6 * a}deg)` }, EASE.inOut],
          [1350, { transform: 'translateY(0px) rotate(0deg)' }],
        ])
      // Rotating about the shoulder, a clockwise turn swings a wing's tip to the left.
      const left = wing(1)
      const right = wing(-1)
      void ctx.gesture(['wing-l'], left.frames, { duration: left.duration })
      void ctx.gesture(['wing-r'], right.frames, { duration: right.duration })
      const lift = track([
        [0, { transform: 'translateY(0px)' }, EASE.out],
        [280, { transform: `translateY(${-1 * a}px)` }, 'linear'],
        [560, { transform: `translateY(${-0.9 * a}px)` }, EASE.inOut],
        [980, { transform: `translateY(${0.2 * a}px)` }, EASE.inOut],
        [1350, { transform: 'translateY(0px)' }],
      ])
      void ctx.gesture(['lantern'], lift.frames, { duration: lift.duration })
    })
  },
} satisfies OwlStanding
