/**
 * The interaction a request belongs to.
 *
 * The worker's telemetry joins requests by `x-rt-interaction` (`lib/worker-url.ts` puts
 * it on every call through the client package): a search and the snippets it fetched, a
 * plan and its execute, an Explorer conversation's turns, a problem report and the calls
 * it is about. The page already mints an id per interaction for the usage log
 * (`newInteractionId` in `lib/usage-log.ts`); this is the one place that remembers the
 * latest, so the header can be read at call time without threading an id through a
 * hundred call sites.
 *
 * The honest limit: one current interaction per page. A request made between two
 * interactions — a balance poll, a facet load — carries the last one begun, which is a
 * join to the thing the reader did most recently rather than to nothing. A page that
 * runs two interactions at once tags both with whichever began last.
 */

let current: string | undefined

/** Begin an interaction: mint an id (or adopt one, an Explorer conversation's) and make it current. */
export function beginInteraction(id: string = crypto.randomUUID()): string {
  current = id
  return id
}

/** The id the next request should carry, or nothing before the first interaction. */
export function currentInteraction(): string | undefined {
  return current
}

/** Forget the current interaction (tests; a page that wants its idle calls untagged). */
export function endInteraction(): void {
  current = undefined
}
