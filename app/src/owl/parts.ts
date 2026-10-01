import type { PoseGeometry } from './types'

/**
 * The owl's parts: the groups every render style's drawing sits in, so a behaviour can
 * move "the head" without knowing which style drew it or which layers it is made of.
 *
 * The scaffold writes one `<g data-part="<name>" transform-origin="x y">` for each, nested
 * as listed. The nesting is the composition scheme:
 *
 *   page                    the whole drawing: the paper on the glass, a pass of light
 *     ground                the disc and the books; stays where the page is
 *     figure                everything that stands on the ground: sway, a hop
 *       body                the torso: breathing
 *       head                about the neck: tilt, nod, lift
 *         features          the eyes, rims, lids and beak, which can slide a little more
 *                           than the head's outline does, which reads as a turn
 *       belly               swells
 *       wing-l, wing-r      shrug about the shoulder
 *       lantern             the light and the hardware, swinging from the handle
 *
 * The body, head, belly, wings and lantern are siblings and not parents of one another,
 * in paint order (a style may put the head after the wings: `OwlStyle.headLast`). What
 * moves the torso therefore does not move the head unless the behaviour says so, which is
 * what makes breathing a thing the head rides on rather than a thing it is part of.
 *
 * Each part carries its own pivot, so any number of behaviours can act on one part: they
 * add transforms to it (`standing/kit.ts`), and the pivot is the part's, not theirs.
 */
export const OWL_PARTS = [
  'page',
  'ground',
  'figure',
  'body',
  'head',
  'features',
  'belly',
  'wing-l',
  'wing-r',
  'lantern',
] as const

/** The y of the lowest point in an absolute path made of lines and curves, which is where the owl stands. */
export function pathBottom(d: string): number {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? []
  let bottom = 0
  // Absolute coordinates come in x, y pairs, so the odd ones are heights.
  for (let i = 1; i < numbers.length; i += 2) bottom = Math.max(bottom, Number(numbers[i]))
  return bottom
}

/** The pivot of each part for one pose, as an SVG `transform-origin` ("x y", in figure units). */
export function partOrigins(pose: PoseGeometry): Record<(typeof OWL_PARTS)[number], string> {
  const base = pathBottom(pose.body)
  // The neck is where the head's outline meets the shoulders, a little below the face's middle.
  const neck = pose.face.cy + pose.face.r * 0.45
  const [wl, wr] = pose.wings
  const shoulder = (w: PoseGeometry['wings'][number] | undefined) =>
    w ? `${w.cx} ${w.cy - w.ry * 0.8}` : '50 50'
  return {
    page: '50 50',
    ground: '50 50',
    figure: `50 ${base}`,
    body: `50 ${base}`,
    head: `50 ${neck}`,
    features: `50 ${pose.eyes.cy}`,
    belly: `50 ${pose.belly.cy}`,
    'wing-l': shoulder(wl),
    'wing-r': shoulder(wr),
    lantern: `${pose.lantern.handle.x} ${pose.lantern.handle.y1}`,
  }
}
