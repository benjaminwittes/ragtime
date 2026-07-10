import type { CorpusHoldings, CorpusSpoke } from '@/spokes/types'

/**
 * Session-scoped cache over `spoke.getHoldings()`.
 *
 * The hub renders each corpus's holdings twice — once as a rounded headline
 * figure in the hero credibility strip and once as exact counts on the spoke
 * card — and both should come from the same fetch. Holdings change on ingest
 * cadence (hours/days), so one resolution per page load is plenty.
 *
 * Failures are not cached: a card remount (or the strip retrying) gets a
 * fresh attempt rather than a poisoned rejection for the rest of the session.
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
