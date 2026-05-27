import type { CorpusSpoke, CorpusSlug } from './types'
import { litigationSpoke } from './litigation'

/**
 * Central registry of declared spokes.
 *
 * The shell reads this to populate the corpus selector / nav and to route
 * URLs. v1 has only the litigation stub (PR 3); other spokes (OLC, USC,
 * CFR, FRUS) get added in their respective implementation PRs. Collection
 * sub-spokes (per brief #7) live in a separate registry that inherits
 * from this one — added when collection architecture ships.
 */
export const spokes: readonly CorpusSpoke[] = [litigationSpoke]

export function getSpokeBySlug(slug: CorpusSlug): CorpusSpoke | undefined {
  return spokes.find((s) => s.slug === slug)
}

/** Active spokes are the ones shown in the nav and routed. */
export function getActiveSpokes(): readonly CorpusSpoke[] {
  return spokes.filter((s) => s.status === 'active')
}
