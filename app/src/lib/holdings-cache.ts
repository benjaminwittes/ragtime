import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'

/**
 * Two caches over `spoke.getHoldings()`, one under the other.
 *
 * One reader: the hub's corpus rows. `HoldingsSummary` in `hub/Hub.tsx` calls
 * this when a row mounts, and it is the only call site in the app — the hero
 * credibility strip that read the same figures as a rounded headline is gone,
 * and the hero carries no counts at all now.
 *
 * The in-memory layer is a map of promises, and it is worth having with a
 * single reader because the rows unmount and remount every time someone leaves
 * the hub for a spoke and comes back. It also collapses a burst: two mounts of
 * the same corpus share one in-flight request rather than racing.
 *
 * The storage layer sits under it, because the map dies with the tab. Seven of
 * the eleven spokes fetch their holdings over the network, so a fresh visit
 * paints seven ellipses and then pops seven figures into place, each on its own
 * schedule — and before this it did that on every visit. The snapshot is what a
 * return visit paints from: `readHoldingsSnapshot` is synchronous, so the
 * figure is there in the first render and the fetch that follows is a refresh
 * rather than a wait. It works because the hub's figure is rounded
 * (`format-count.ts`): an ingest that moved a count by a few hundred re-renders
 * the same string, so nothing on the screen moves when the fresh value lands.
 *
 * There is no expiry. The stored value carries an `at` timestamp, written for
 * whoever wants a rule later and read by nothing today. A stale count on a
 * navigation surface is corrected within the second by the fetch that is
 * already running, so a TTL would only decide how often a returning reader is
 * shown the ellipsis again. Holdings move on ingest cadence — hours, days — and
 * the figure is rounded to two significant figures, so "stale" here usually
 * means "identical".
 *
 * Failures are cached nowhere. A remount gets a fresh attempt rather than a
 * poisoned rejection, and a failed fetch leaves any stored snapshot standing,
 * which is what lets the hub keep showing yesterday's figure instead of falling
 * back to "count unavailable".
 */
const cache = new Map<string, Promise<CorpusHoldings>>()

/** One key per spoke, in the dotted namespace the newer modules use. */
const STORAGE_PREFIX = 'ragtime.holdings.'

/** What gets stored: the holdings as fetched, and when they were fetched. */
type StoredHoldings = { holdings: CorpusHoldings; at: string }

/**
 * The last holdings stored for this spoke, or null if there are none to be had.
 *
 * Synchronous by design — its whole purpose is to be readable during the first
 * render, before any effect has run. Null covers every way this can go wrong,
 * and they are all ordinary: no storage during a server render, a throw on
 * access in private mode, a cleared origin, or a value written by an older
 * release that no longer parses into anything the hub can read.
 */
export function readHoldingsSnapshot(spoke: CorpusSpoke): CorpusHoldings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + spoke.slug)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { holdings } = parsed as { holdings?: unknown }
    return usableHoldings(holdings) ? holdings : null
  } catch {
    return null
  }
}

/**
 * Does a stored value still hold what the hub reads out of it?
 *
 * The check is `counts`, because `counts` is all the hub touches — it takes the
 * first entry and formats the number, and a count that came back as a string or
 * a null would render as nonsense. The rest of `CorpusHoldings` is not
 * inspected, and one field does not survive the round trip as it went in:
 * `lastUpdated` is typed `Date | string` and JSON hands back the string, which
 * is why the type admits both. Nothing in the hub reads it.
 */
function usableHoldings(value: unknown): value is CorpusHoldings {
  if (typeof value !== 'object' || value === null) return false
  const { counts } = value as { counts?: unknown }
  if (typeof counts !== 'object' || counts === null) return false
  return Object.values(counts as Record<string, unknown>).every(
    (n) => typeof n === 'number' && Number.isFinite(n),
  )
}

function writeHoldingsSnapshot(spoke: CorpusSpoke, holdings: CorpusHoldings): void {
  if (typeof window === 'undefined') return
  try {
    const stored: StoredHoldings = { holdings, at: new Date().toISOString() }
    window.localStorage.setItem(STORAGE_PREFIX + spoke.slug, JSON.stringify(stored))
  } catch {
    // Private mode, a full origin, or a value that will not serialise. A write
    // that did not land costs the next visit an ellipsis; it is not an error
    // and there is no one to tell.
  }
}

export function getHoldingsCached(spoke: CorpusSpoke): Promise<CorpusHoldings> {
  const existing = cache.get(spoke.slug)
  if (existing) return existing
  const p = spoke
    .getHoldings()
    .then((holdings) => {
      writeHoldingsSnapshot(spoke, holdings)
      return holdings
    })
    .catch((err: unknown) => {
      cache.delete(spoke.slug)
      throw err
    })
  cache.set(spoke.slug, p)
  return p
}
