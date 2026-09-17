/**
 * The one number a hub entry carries, rounded to what it is for.
 *
 * On the hub the figure's job is scale — how much is in here, is it thousands
 * or millions — and not audit. The exact number lives on the spoke's own
 * provenance disclosure, next to the coverage window and the known gaps that
 * qualify it, which is where someone checking a figure should be reading it.
 * So the hub rounds, and a rounded figure is honest about what it is: "1.7M
 * cases" claims scale and nothing finer, where "1,737,246 cases" claims a
 * precision the hub cannot stand behind by the afternoon.
 *
 * Rounding is also what makes the stored snapshot (`holdings-cache.ts`) sit
 * still. An ingest that adds a few hundred cases overnight re-renders the same
 * string, so a return visit paints the figure from storage and the fresh fetch
 * lands on top of it without anything moving on the screen.
 *
 * Small counts are not rounded at all. A corpus of 2,151 opinions is countable,
 * the exact figure is as short as the rounded one, and "2.2K opinions" would be
 * a loss of information for no gain in width. The line falls at 10,000, which
 * is where two significant figures start being a shorter thing to read than the
 * number itself.
 */

/**
 * Format a count for the hub's ledger line.
 *
 *   - Below 10,000: exact, grouped — `2,151`, `9,999`, `0`.
 *   - From 10,000: two significant figures with a unit — `60K`, `810K`,
 *     `1.7M` — and a trailing `.0` dropped, so a million reads `1M`.
 *
 * `M` is the top unit. Nothing here is within three orders of magnitude of a
 * billion, so there is no `B` to get wrong; a figure that large would render as
 * a grouped count of millions rather than silently lose its unit.
 *
 * The contract is a non-negative, finite integer — a count. Anything else takes
 * the exact branch and shows itself, because a caller passing something that is
 * not a count has a bug that should be visible rather than rounded away.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 10_000) {
    return Math.round(value).toLocaleString('en-US')
  }

  const inMillions = value >= 1_000_000
  let scaled = roundToTwoSigFigs(value / (inMillions ? 1_000_000 : 1_000))
  let unit = inMillions ? 'M' : 'K'

  // 999,950 is 999.95 thousand, and two significant figures of that is 1000 —
  // a figure that has outgrown its own unit. `1000K` is never the answer, so
  // carry it: everything from 995,000 up reads `1M`. (The same carry at the top
  // of the millions needs no code — 9,999,999 rounds to 10 and prints `10M`.)
  if (!inMillions && scaled >= 1000) {
    scaled = scaled / 1000
    unit = 'M'
  }

  return `${renderScaled(scaled)}${unit}`
}

/**
 * Two significant figures, rounding halves up.
 *
 * Below 10 that is tenths; above it, the step is one order of magnitude down
 * from the value — units for 60.4, tens for 809.2, which is what turns 809.23
 * thousand into 810 rather than 809.
 */
function roundToTwoSigFigs(x: number): number {
  // Multiplying by 10 rather than dividing by 0.1: the same arithmetic, without
  // the binary representation of 0.1 pushing a value across a rounding edge.
  if (x < 10) return Math.round(x * 10) / 10
  const step = 10 ** (Math.floor(Math.log10(x)) - 1)
  return Math.round(x / step) * step
}

/** The rounded value as text: a whole number from 10 up, one decimal below it. */
function renderScaled(x: number): string {
  if (x >= 10) return Math.round(x).toLocaleString('en-US')
  // `toFixed` rather than the raw quotient, which carries float noise
  // (17 / 10 is not 1.7 exactly). A trailing `.0` says nothing and goes.
  const text = x.toFixed(1)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}
