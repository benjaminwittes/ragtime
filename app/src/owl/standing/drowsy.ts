import type { OwlStanding } from '../types'
import { cycle, n } from './core/frames'

/**
 * Drowsy lids: the eyes sink slowly towards shut, hold there, snap most of the way back
 * open, and then do it again more gently, with the head dipping as the lids do. It stacks
 * with the blink: the lids' height is the blink's multiplied by this, so an owl in the
 * middle of drooping still blinks.
 *
 * At amount 1 the lids go to 55% of their height at the lowest, and the head sinks 0.8
 * units.
 */

/** 0 awake, 1 at the bottom of the droop, over one cycle. */
function droop(t: number): number {
  const ease = (x: number) => x * x * (3 - 2 * x)
  const part = (from: number, to: number, x: number) => ease(Math.min(1, Math.max(0, (x - from) / (to - from))))
  if (t < 0.46) return part(0, 0.3, t) - 0.04 * Math.sin(t * 90) * part(0.3, 0.34, t) * (1 - part(0.4, 0.46, t))
  if (t < 0.62) return 1 - part(0.46, 0.5, t) * 0.95
  if (t < 0.88) return 0.05 + part(0.62, 0.88, t) * 0.55
  return 0.6 - part(0.88, 0.95, t) * 0.6
}

export default {
  id: 'drowsy',
  label: 'Drowsy lids',
  note: 'The lids sink slowly, hold, and snap back; the head dips with them.',
  period: 19,
  start(ctx) {
    ctx.loop(
      ctx.all('.owl-eyes'),
      ({ amount: a }) => cycle((t) => ({ transform: `scaleY(${n(Math.max(0.05, 1 - 0.45 * a * droop(t)))})` }), 48),
    )
    ctx.loop('head', ({ amount: a }) => cycle((t) => ({ transform: `translateY(${n(0.8 * a * droop(t))}px)` }), 48))
  },
} satisfies OwlStanding
