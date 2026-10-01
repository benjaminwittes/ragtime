/**
 * Where the owl's pupils sit while it watches a pointer.
 *
 * A pure function of three things — the box the owl is drawn in, where its eyes are
 * inside that box, and where the pointer is — so the arithmetic can be tested without a
 * browser (`gaze.test.ts`) and `useGaze.ts` is left with only the listener.
 *
 * The answer is in the drawing's own units, not in pixels: the owl is a 100×100 figure
 * drawn at whatever size its caller asks for, and a pupil that travels two units travels
 * the same share of its lens at 28px as at 112px.
 *
 * How far a pupil may travel is the design's `motion.gazeTravel`, a share of the lens's
 * radius; callers turn it into figure units and pass it as `travel`.
 */

export type GazeBox = { left: number; top: number; width: number; height: number }

export type Gaze = { x: number; y: number }

/**
 * @param box     the owl's box on the screen, in CSS pixels
 * @param eyeY    how far down the 100-unit figure the eyes are (38 standing, 34 on the stacks)
 * @param travel  the furthest a pupil may move from the middle of its lens, in figure units
 * @param px,py   the pointer, in the same CSS pixels as `box`
 */
export function owlGaze(
  box: GazeBox,
  eyeY: number,
  travel: number,
  px: number,
  py: number,
): Gaze {
  // A box with no size is an owl that is not on the screen; it looks straight ahead.
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 }
  const dx = px - (box.left + box.width / 2)
  const dy = py - (box.top + (box.height * eyeY) / 100)
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { x: 0, y: 0 }
  // Full deflection once the pointer is a figure-and-a-half away, and proportionally
  // less inside that. Without the ramp the pupils snap from one rim to the other as the
  // pointer crosses the face, which reads as a twitch rather than as a look.
  const reach = Math.min(1, distance / (box.width * 1.5)) * travel
  return { x: (dx / distance) * reach, y: (dy / distance) * reach }
}
