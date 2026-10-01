import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'
import { lidClosed } from './core/lids'

/**
 * A slow blink: the lids close over most of half a second, rest shut for a beat, and open
 * more slowly than they shut. The look of an owl that is at ease. Adds to the ordinary
 * blink, like the double one.
 *
 * Amount scales how far the lids go (at 1, as far as the ordinary blink does).
 */
export default {
  id: 'slow-blink',
  label: 'Slow blink',
  note: 'Now and then the lids close slowly, rest, and open slowly.',
  period: 22,
  start(ctx) {
    ctx.every(() => {
      const shut = 1 - (1 - lidClosed(ctx.svg)) * Math.min(1, ctx.config.amount)
      const blink = track([
        [0, { transform: 'scaleY(1)' }, EASE.inOut],
        [480, { transform: `scaleY(${shut})` }, 'linear'],
        [720, { transform: `scaleY(${shut})` }, EASE.inOut],
        [1350, { transform: 'scaleY(1)' }],
      ])
      void ctx.gesture(ctx.all('.owl-eyes'), blink.frames, { duration: blink.duration })
    })
  },
} satisfies OwlStanding
