import { owlGaze } from './gaze'

/**
 * The DOM contract: the hooks other code finds the owl by.
 *
 * `stage/mirror.ts` and `stage/presenter.ts` turn every owl on a mirrored page toward the
 * presenter's pointer, and `e2e/stage.mjs` reads the lantern state. They know the owl only
 * by what is below, so every render style must emit the first:
 *
 *   - `svg[data-owl="<pose>"]`            the root; `data-lantern` is `dark`, `lit` or `searching`
 *
 * and may honour the rest, which a drawing with eyes would:
 *
 *   - `.owl-eyes`                         the group that blinks; its first `circle` is a lens, and
 *                                         its `r` and `cy` are what the gaze arithmetic reads
 *   - `.owl-pupils`                       the group the gaze moves
 *   - `--owl-gaze-x`, `--owl-gaze-y`      what moves `.owl-pupils`, in figure units, on the root
 *   - `--owl-gaze-travel`                 how far a pupil may go, as a share of the lens radius
 *
 * The line-tile owl has no separate eyes to turn, so a presenter's pointer finds nothing to
 * move on it: `lookOwlAt` leaves it as it is.
 */

export const OWL_ATTR = 'data-owl'
export const LANTERN_ATTR = 'data-lantern'
export const GAZE_X = '--owl-gaze-x'
export const GAZE_Y = '--owl-gaze-y'
export const GAZE_TRAVEL = '--owl-gaze-travel'

/**
 * Turn one rendered owl to look at a point in the window, or straight ahead for `null`.
 * Reads the geometry from the owl itself — the first lens and the travel it was drawn
 * with — so it works for an owl of any variant or style, and for one this module did not
 * render a moment ago.
 */
export function lookOwlAt(owl: SVGSVGElement, at: { x: number; y: number } | null): void {
  const lens = owl.querySelector('.owl-eyes circle')
  const share = Number.parseFloat(owl.style.getPropertyValue(GAZE_TRAVEL))
  let x = 0
  let y = 0
  if (at && lens && Number.isFinite(share)) {
    const eyeY = Number(lens.getAttribute('cy'))
    const travel = Number(lens.getAttribute('r')) * share
    ;({ x, y } = owlGaze(owl.getBoundingClientRect(), eyeY, travel, at.x, at.y))
  }
  owl.style.setProperty(GAZE_X, x.toFixed(2))
  owl.style.setProperty(GAZE_Y, y.toFixed(2))
}
