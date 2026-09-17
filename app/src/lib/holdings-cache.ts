import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'

/**
 * Session-scoped cache over `spoke.getHoldings()`.
 *
 * One reader: the hub's corpus rows. `HoldingsSummary` in `hub/Hub.tsx` calls
 * this when a row mounts, and it is the only call site in the app — the hero
 * credibility strip that read the same figures as a rounded headline is gone,
 * and the hero carries no counts at all now.
 *
 * The cache is still worth having with a single reader, because the rows
 * unmount and remount every time someone leaves the hub for a spoke and comes
 * back. Holdings change on ingest cadence (hours/days), so one resolution per
 * corpus per session is plenty.
 *
 * Failures are not cached: a row remount gets a fresh attempt rather than a
 * poisoned rejection for the rest of the session.
 */
const cache = new Map<string, Promise<CorpusHoldings>>()

export function getHoldingsCached(spoke: CorpusSpoke): Promise<CorpusHoldings> {
  const existing = cache.get(spoke.slug)
  if (existing) return existing
  const p = spoke.getHoldings().catch((err: unknown) => {
    cache.delete(spoke.slug)
    throw err
  })
  cache.set(spoke.slug, p)
  return p
}
