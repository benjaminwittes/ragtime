import type { CSSProperties } from 'react'
import { GAZE_TRAVEL } from './contract'
import type { OwlDesign } from './types'

/**
 * The design's motion, as the custom properties `owl.css` reads.
 *
 * Written on each owl's own root rather than on the document, so two owls on one page can
 * wear two variants and so a figure copied into another document (the stage mirrors the
 * presenter's markup) takes its timings with it. Pure, and tested (`vars.test.ts`).
 */
export function motionVars(motion: OwlDesign['motion']): Record<string, string> {
  return {
    '--owl-blink-period': `${motion.blinkPeriod}s`,
    '--owl-blink-closed': String(motion.blinkClosed),
    '--owl-gaze-ease': `${motion.gazeEase}ms`,
    [GAZE_TRAVEL]: String(motion.gazeTravel),
    '--owl-glow-lit': String(motion.glowLit),
    '--owl-glow-fade': `${motion.glowFade}ms`,
    '--owl-search-period': `${motion.searchPeriod}s`,
    '--owl-search-low': String(motion.searchLow),
    '--owl-search-high': String(motion.searchHigh),
    '--owl-shake-time': `${motion.shakeTime}ms`,
    '--owl-shake-reach': `${motion.shakeReach}px`,
  }
}

/** The same, typed for a `style` prop, which does not know custom properties. */
export function motionStyle(motion: OwlDesign['motion']): CSSProperties {
  return motionVars(motion) as CSSProperties
}
