import { useState, type CSSProperties } from 'react'
import { isNight } from './resolve'
import { useStyle } from './styles'
import type { OwlLantern, OwlPin, OwlPose } from './types'
import { useTunable } from '@/tune/useTunable'
import { useOwlDesign } from './useOwlDesign'

/**
 * The RAGtime owl: an archivist in spectacles, carrying a lantern.
 *
 * The owl is drawn in line tiles (`styles/lines/`): tiles of parallel lines that thicken and
 * thin like ink, in 100×100 units. It blinks, breathes and carries a lantern that can be lit,
 * and it moves nothing outside its own box, so an owl costs the page around it nothing. It
 * stops moving for a reader who has asked for reduced motion. The engraving is a setting of
 * that drawing, not another one.
 *
 * It is not the mark. `Mark.tsx` is the fluting — the site bar, the favicon, the cursor
 * that paints an Explorer answer in — and stays what it was. The owl is a character and
 * the mark is a signature, and a page may have both.
 *
 * This component is the orchestrator and holds no drawing of its own. It resolves a
 * design (the base, a variant over it, whatever is tuned over that — `resolve.ts`), hands
 * it to the render style the design names (`styles/`), and applies the night lantern. Pages
 * do not place it
 * directly; they mount it through `OwlSpot`, which reads how that page embeds it from
 * one table (`embeds.ts`).
 */
export function Owl({
  pose = 'archivist',
  lantern = 'dark',
  keepsHours = false,
  className,
  style,
  title,
  variant,
  pin,
}: {
  pose?: OwlPose
  lantern?: OwlLantern
  /**
   * An owl keeps late hours: with this set, a lantern nobody asked to light is lit anyway
   * during the design's night hours (eight in the evening until six in the morning,
   * unless a variant says otherwise), by the reader's own clock.
   */
  keepsHours?: boolean
  /** Sizes the figure. It is square, so a width is enough. */
  className?: string
  style?: CSSProperties
  /** Give the owl a name only where it stands for something; beside text that speaks for it, it is decoration. */
  title?: string
  /** A variant id. Without one the owl wears the active variant (the Tune panel's, or the base). */
  variant?: string
  /** A design laid over everything, the panel's values included. Keep it stable (a constant or a memo). */
  pin?: OwlPin
}) {
  const design = useOwlDesign(variant, pin)
  const show = useTunable<boolean>('owl.show')
  // Read once, when the owl arrives, rather than kept by a clock: a lantern that came on
  // at the stroke of eight under someone mid-sentence would be the page changing under
  // them, and a visit that spans the hour is rare enough to leave as it started. The hour
  // is kept and the window applied to it, so tuning the window is seen at once.
  const [hour] = useState(() => new Date().getHours())
  const shown: OwlLantern = lantern === 'dark' && keepsHours && isNight(hour, design.night) ? 'lit' : lantern

  // The style the design names, once its drawing has arrived; an empty box in the same size
  // until then, so a style that is fetched late is a swap inside the figure and no more.
  const renderStyle = useStyle(design.style)

  // The reader's switch (the gear in the site bar): no owl, and the box it sat in is left as it was.
  if (!show) return null

  const Figure = renderStyle.figure
  return <Figure design={design} poseId={pose} lantern={shown} className={className} style={style} title={title} />
}
