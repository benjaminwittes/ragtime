import type { OwlStanding } from '../types'
import { EASE, n } from './core/frames'
import './flicker.css'

/**
 * The lantern's flame flickers: the flame shivers in height and width, the rays thin and
 * return, and the glow gutters, each on its own random sequence and all of them stepped,
 * about nine times a second. It adds to the glow's own pulse while a search is out, and it
 * only ever dims what is lit, so a dark lantern stays dark.
 *
 * The cycle is 16 steps drawn from the owl's seeded stream. Its period is the cycle's
 * length: 1.8 seconds is nine steps a second.
 *
 * At amount 1 the flame varies by about 15% in height, the rays dim by up to 45%, and the
 * glow by up to 30%.
 */

const STEPS = 16

export default {
  id: 'flicker',
  label: 'Flame flicker',
  note: 'The flame shivers; a lit lantern’s rays and glow gutter a little, stepped.',
  period: 1.8,
  start(ctx) {
    const sequence = () => Array.from({ length: STEPS }, () => ctx.rng())
    const run = (target: Parameters<typeof ctx.loop>[0], at: (draw: number, a: number) => Record<string, string | number>) => {
      const draws = sequence()
      ctx.loop(
        target,
        ({ amount: a }) =>
          Array.from({ length: STEPS + 1 }, (_, i) => ({ offset: i / STEPS, easing: EASE.step, ...at(draws[i % STEPS], a) })),
        { own: true },
      )
    }
    run(ctx.all('.owl-flame'), (d, a) => ({ transform: `scale(${n(1 + (d - 0.5) * 0.1 * a)}, ${n(1 + (d - 0.4) * 0.3 * a)})` }))
    run(ctx.all('.owl-glow'), (d, a) => ({ opacity: n(-0.3 * a * d) }))
    run(ctx.all('.eng-rays'), (d, a) => ({ opacity: n(-0.45 * a * d) }))
  },
} satisfies OwlStanding
