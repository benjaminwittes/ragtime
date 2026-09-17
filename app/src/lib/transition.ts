/**
 * Run a route change as a view transition — or, when it should not be one, as the plain
 * state update it has always been.
 *
 * A view transition is the browser doing the thing this app cannot do for itself: it
 * screenshots the page, lets React replace the DOM, screenshots it again, and animates
 * between the two. What makes it worth reaching for rather than animating by hand is that
 * a piece named on both sides — the ask box, the surface's opening lines — is *one* group
 * with a start and an end rectangle, so the browser interpolates a real position and size
 * instead of cross-fading two pictures of it. The names and the choreography are in
 * `src/transitions.css`; this file is only the trigger.
 *
 * Two conditions, and the failure of either lands back on today's behaviour exactly:
 *
 *   - `document.startViewTransition` exists. Safari and Firefox shipped it later than
 *     Chrome and a browser without it is not a browser to degrade for — it simply gets
 *     the instant swap, which is what every reader had until this change.
 *   - The reader has not asked for reduced motion. A page that rearranges itself is the
 *     exact thing that setting is about, and the honest reading of it here is not "a
 *     shorter animation" but "no animation": the transition is not started at all, so
 *     there is nothing to shorten and nothing to get stuck half-done.
 *
 * `flushSync` is not an optimisation and the transition is broken without it. The
 * callback's job is to leave the DOM in its *new* state before it returns, because the
 * browser takes its second screenshot the moment it does; React's default is to batch the
 * update and commit it later, by which time the screenshot is of the old page and the
 * animation is between two identical images. It is safe here for the reason it is unsafe
 * almost everywhere else: the caller is a `popstate` handler, outside React's render and
 * lifecycle, which is the one place React permits a synchronous flush without warning.
 */

import { flushSync } from 'react-dom'

export function withViewTransition(update: () => void): void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (still || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => {
    flushSync(update)
  })
}
