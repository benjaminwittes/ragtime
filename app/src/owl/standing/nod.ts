import type { OwlStanding } from '../types'
import { EASE, track } from './core/frames'

/**
 * A nod: the head drops and comes back up, quick down and slower up. It happens now and
 * then of its own accord, and it happens when the owl speaks — the speech component tells
 * the figure's parent (`owl-speak`) — where it is a smaller one with the lantern lifting a
 * little, as a hand does when someone starts a sentence.
 *
 * At amount 1 the head drops 1.1 units and tips 2 degrees.
 */

function nod(ctx: Parameters<OwlStanding['start']>[0], scale: number) {
  const a = ctx.config.amount * scale
  const dip = track([
    [0, { transform: 'translateY(0px) rotate(0deg)' }, EASE.out],
    [170, { transform: `translateY(${1.1 * a}px) rotate(${2 * a}deg)` }, 'linear'],
    [430, { transform: `translateY(${1.0 * a}px) rotate(${1.8 * a}deg)` }, EASE.inOut],
    [1150, { transform: 'translateY(0px) rotate(0deg)' }],
  ])
  void ctx.gesture(['head'], dip.frames, { duration: dip.duration })
}

export default {
  id: 'nod',
  label: 'Nod',
  note: 'The head dips and comes back up, now and then and whenever the owl speaks.',
  period: 24,
  start(ctx) {
    ctx.every(() => nod(ctx, 1))
    const owl = ctx.svg.parentElement
    if (!owl) return
    ctx.on(owl, 'owl-speak', () => {
      if (ctx.paused) return
      nod(ctx, 0.6)
      const a = ctx.config.amount
      const lift = track([
        [0, { transform: 'translateY(0px)' }, EASE.out],
        [260, { transform: `translateY(${-0.9 * a}px)` }, EASE.inOut],
        [900, { transform: 'translateY(0px)' }],
      ])
      void ctx.gesture(['lantern', 'wing-r'], lift.frames, { duration: lift.duration })
    })
  },
} satisfies OwlStanding
