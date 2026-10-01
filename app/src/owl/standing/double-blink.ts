import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'
import { lidClosed } from './core/lids'

/**
 * A double blink: two quick closes in a row, the second a little shallower. It adds to the
 * owl's ordinary blink and runs on the same lids, so it is a variation on it and does not
 * replace it.
 *
 * Amount scales how long the pair takes (at 1, about a third of a second).
 */
export default {
  id: 'double-blink',
  label: 'Double blink',
  note: 'Now and then the owl blinks twice, quickly.',
  period: 13,
  start(ctx) {
    ctx.every(() => {
      const shut = lidClosed(ctx.svg)
      const s = 1 / Math.max(ctx.config.amount, 0.3)
      const pair = track([
        [0, { transform: 'scaleY(1)' }, EASE.out],
        [70 * s, { transform: `scaleY(${shut})` }, EASE.inOut],
        [150 * s, { transform: 'scaleY(1)' }, EASE.out],
        [215 * s, { transform: `scaleY(${Math.min(1, shut * 2.2)})` }, EASE.inOut],
        [300 * s, { transform: 'scaleY(1)' }],
      ])
      void ctx.gesture(ctx.all('.owl-eyes'), pair.frames, { duration: pair.duration })
    })
  },
} satisfies OwlStanding
