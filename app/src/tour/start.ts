/**
 * Starting the tour from somewhere that is not the tour.
 *
 * The tour is mounted once, in `App`, above the router; the things that start it — the
 * hub's link under the search box — are somewhere inside a route. An event rather than a
 * context, because the two ends share nothing else and a provider wrapped round the whole
 * app to carry one function would be more machinery than the function.
 *
 * Kept out of `steps.ts` so that file stays free of `window` and its tests stay plain.
 */

export const TOUR_EVENT = 'ragtime:tour'

export function startTour(): void {
  window.dispatchEvent(new Event(TOUR_EVENT))
}
