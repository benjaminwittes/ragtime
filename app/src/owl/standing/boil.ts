import type { OwlStanding } from '../types'
import { EASE, n } from './core/frames'

/**
 * Registration jitter, the page re-seating on the glass: the whole drawing moves by a
 * fraction of a unit and a hair of a degree to a new place, and holds it, about six times
 * a second, like an animation shot on twos. In the engraved style the cross-hatch plate
 * re-seats separately from the line screen, so the two are never quite in register, which
 * is what makes the lines seem to boil. In the flat style it is the whole figure only.
 *
 * It is stepped by nature, so the stepping setting does not touch it, and it is the
 * cheapest motion the scan finish can have: six filter passes a second.
 *
 * The cycle is 24 positions, drawn from the owl's own seeded stream, so it does not repeat
 * in any way that is noticed. Its period is the length of the cycle: 4 seconds is six
 * positions a second, and a shorter period is a faster boil.
 *
 * At amount 1 the page moves up to 0.22 of a unit and 0.12 of a degree, and the hatch
 * plate a further 0.3 of a unit.
 */

const POSITIONS = 24

export default {
  id: 'boil',
  label: 'Line boil',
  note: 'The page re-seats on the glass, a fraction of a unit, six times a second; the hatching drifts out of register.',
  period: 4,
  start(ctx) {
    const draws = Array.from({ length: POSITIONS }, () => [ctx.rng(), ctx.rng(), ctx.rng()] as const)
    const frames = (a: number, reach: number, turn: number, shift: number) =>
      Array.from({ length: POSITIONS + 1 }, (_, i) => {
        const [x, y, r] = draws[(i + shift) % POSITIONS]
        return {
          offset: i / POSITIONS,
          easing: EASE.step,
          transform: `translate(${n((x - 0.5) * 2 * reach * a)}px, ${n((y - 0.5) * 2 * reach * a)}px) rotate(${n((r - 0.5) * 2 * turn * a)}deg)`,
        }
      })
    ctx.loop('page', ({ amount }) => frames(amount, 0.22, 0.12, 0), { own: true })
    // The hatch plate is a second printing: its own positions, the same for every region.
    ctx.loop(ctx.all('.eng-hatch'), ({ amount }) => frames(amount, 0.3, 0, 7), { own: true })
  },
} satisfies OwlStanding
