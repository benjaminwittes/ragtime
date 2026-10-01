import { useRef, useState, type CSSProperties } from 'react'
import { isNight } from './resolve'
import { OwlDrawing } from './scaffold'
import { useStanding } from './standing'
import { getStyle } from './styles'
import type { OwlLantern, OwlPin, OwlPose } from './types'
import { useGaze } from './useGaze'
import { useOwlDesign } from './useOwlDesign'

/**
 * The RAGtime owl: an archivist in spectacles, carrying a lantern.
 *
 * Drawn from the avatar concepts Ben Wittes sent on 2026-09-30, and kept to them: every
 * shape and colour is the one in the concept sheet, in the sheet's own 100×100 units
 * (`design.ts`, `styles/flat/`). What this component adds is only what a still drawing
 * could not have: the owl blinks, its eyes follow a pointer, and its lantern can be lit.
 * None of the three moves a pixel outside the figure's own box, so an owl costs the page
 * around it nothing — the same rule the hub's tabs and Tab hint keep. All three stop for
 * a reader who has asked for reduced motion, and the eyes stay centred where there is no
 * pointer to follow.
 *
 * It is not the mark. `Mark.tsx` is the fluting — the site bar, the favicon, the cursor
 * that paints an Explorer answer in — and stays what it was. The owl is a character and
 * the mark is a signature, and a page may have both.
 *
 * This component is the orchestrator and holds no drawing of its own. It resolves a
 * design (the base, a variant over it, whatever is tuned over that — `resolve.ts`), hands
 * it to the render style the design names (`styles/`) inside the scaffold that writes the
 * DOM contract (`scaffold.tsx`), and wires the behaviours: the night lantern here, the
 * gaze (`useGaze.ts`), the standing behaviours (`standing/`). Pages do not place it
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
  /**
   * A design laid over everything, the panel's values included, with standing knobs of its
   * own, for a specimen that has to stay what it is while the panel moves the other owls:
   * the lab's. Keep it stable (a constant or a memo); a new object is a new design.
   */
  pin?: OwlPin
}) {
  const design = useOwlDesign(variant, pin)
  const svg = useRef<SVGSVGElement>(null)
  // Read once, when the owl arrives, rather than kept by a clock: a lantern that came on
  // at the stroke of eight under someone mid-sentence would be the page changing under
  // them, and a visit that spans the hour is rare enough to leave as it started. The hour
  // is kept and the window applied to it, so tuning the window is seen at once.
  const [hour] = useState(() => new Date().getHours())
  const shown: OwlLantern = lantern === 'dark' && keepsHours && isNight(hour, design.night) ? 'lit' : lantern

  useGaze(svg, design.motion.gazeFollow)
  useStanding(svg, design)

  return (
    <OwlDrawing
      design={design}
      poseId={pose}
      lantern={shown}
      renderStyle={getStyle(design.style)}
      svgRef={svg}
      className={className}
      style={style}
      title={title}
    />
  )
}
