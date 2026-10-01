import { GAZE_TRAVEL, GAZE_X, GAZE_Y } from '../contract'
import type { OwlStanding } from '../types'

/**
 * An idle glance: when the pointer has not moved for a while, the eyes wander off to one
 * side for a moment and come back. The instant the pointer moves again the glance ends
 * and the eyes are the pointer's.
 *
 * It moves the pupils the way the gaze does, through the same two custom properties on the
 * figure, so it needs no part of its own and works in every style. Those properties are
 * the ones the stage's mirror already leaves out of what it sends (`stage/mirror.ts`), and
 * a glance writes them a few times a minute, so it adds nothing to what the stage sees.
 *
 * At amount 1 the pupils go as far as the gaze does at full reach.
 */

/** Milliseconds without a pointer move before the owl may look away. */
const IDLE_MS = 5000

export default {
  id: 'glance',
  label: 'Idle glance',
  note: 'When the pointer has been still for a few seconds the eyes wander off for a moment, and yield when it moves.',
  period: 9,
  start(ctx) {
    const style = ctx.svg.style
    let last = Number.NEGATIVE_INFINITY
    let back = 0
    let before: [string, string] | null = null

    function end() {
      window.clearTimeout(back)
      back = 0
      if (before) {
        style.setProperty(GAZE_X, before[0])
        style.setProperty(GAZE_Y, before[1])
        before = null
      }
    }

    ctx.on(window, 'pointermove', () => {
      last = performance.now()
      end()
    })

    ctx.every(() => {
      if (before || performance.now() - last < IDLE_MS) return
      const lens = ctx.svg.querySelector('.owl-eyes circle')
      const share = Number.parseFloat(style.getPropertyValue(GAZE_TRAVEL))
      if (!lens || !Number.isFinite(share)) return
      const reach = Number(lens.getAttribute('r')) * share * ctx.config.amount
      const angle = ctx.rng() * Math.PI * 2
      const far = 0.6 + 0.4 * ctx.rng()
      before = [style.getPropertyValue(GAZE_X), style.getPropertyValue(GAZE_Y)]
      style.setProperty(GAZE_X, (Math.cos(angle) * reach * far).toFixed(2))
      style.setProperty(GAZE_Y, (Math.sin(angle) * reach * far * 0.6).toFixed(2))
      back = window.setTimeout(end, 900 + ctx.rng() * 1800)
    })

    return end
  },
} satisfies OwlStanding
