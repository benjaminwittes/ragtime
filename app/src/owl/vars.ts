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

/**
 * The lantern's searching look, as custom properties: how far it swings (degrees), how far
 * the pupils scan (figure units), and how far it is lifted (figure units). They are knobs
 * of their own (`knobs/motion.ts`, ids `owl.search.*`) and not part of the design, so the
 * design's pinned motion record stays what it was; `read` is how a knob is looked up, which
 * is the tuning store's `tuneValue` in the app and a stub in a test.
 */
export function searchVars(read: (id: string) => unknown): Record<string, string> {
  const num = (id: string) => (typeof read(id) === 'number' ? (read(id) as number) : 0)
  return {
    '--owl-search-swing': `${num('owl.search.swing')}deg`,
    '--owl-search-scan': String(num('owl.search.scan')),
    '--owl-search-lift': String(num('owl.search.lift')),
  }
}

/** The same, typed for a `style` prop, which does not know custom properties. */
export function motionStyle(motion: OwlDesign['motion']): CSSProperties {
  return motionVars(motion) as CSSProperties
}
