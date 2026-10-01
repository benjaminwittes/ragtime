import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'

/**
 * A startle: a click or a tap on the owl makes it hop and its eyes go wide for a moment.
 * A reaction to the reader's own doing, so there is no schedule; the period is how long
 * the startle lasts.
 *
 * At amount 1 the figure rises 1.4 units, the head rocks back 2.5 degrees, and the eyes
 * widen by a tenth.
 */
export default {
  id: 'startle',
  label: 'Startle',
  note: 'A click or tap on the owl makes it hop and its eyes go wide. Its period is how long that takes.',
  period: 0.5,
  start(ctx) {
    let busy = false
    ctx.on(ctx.svg, 'pointerdown', () => {
      if (busy || ctx.paused) return
      busy = true
      const a = ctx.config.amount
      const ms = ctx.config.period * 1000
      const k = (at: number) => at * ms
      const hop = track([
        [0, { transform: 'translateY(0px)' }, EASE.out],
        [k(0.28), { transform: `translateY(${-1.4 * a}px)` }, EASE.inOut],
        [k(1), { transform: 'translateY(0px)' }],
      ])
      const head = track([
        [0, { transform: 'rotate(0deg)' }, EASE.out],
        [k(0.3), { transform: `rotate(${-2.5 * a}deg)` }, EASE.inOut],
        [k(1.2), { transform: 'rotate(0deg)' }],
      ])
      const eyes = track([
        [0, { transform: 'scale(1)' }, EASE.out],
        [k(0.2), { transform: `scale(${1 + 0.1 * a})` }, EASE.inOut],
        [k(1.6), { transform: 'scale(1)' }],
      ])
      void ctx.gesture(['figure'], hop.frames, { duration: hop.duration })
      void ctx.gesture(['head'], head.frames, { duration: head.duration })
      void ctx.gesture(ctx.all('.owl-eyes'), eyes.frames, { duration: eyes.duration }).then(() => {
        busy = false
      })
    })
  },
} satisfies OwlStanding
