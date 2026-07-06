import type { CorpusSpoke, CorpusSlug } from './types'
import { cfrSpoke } from './cfr'
import { frSpoke } from './fr'
import { frusSpoke } from './frus'
import { lawfareSpoke } from './lawfare'
import { litigationSpoke } from './litigation'
import { olcSpoke } from './olc'
import { presidentialSpoke } from './presidential'
import { uscSpoke } from './usc'

/**
 * Central registry of declared spokes.
 *
 * The hub reads this to render the corpus cards (active spokes get an "Open
 * →" link; coming-soon spokes show a disabled placeholder with the same
 * holdings disclosure). Spoke routes are resolved through `getSpokeBySlug`
 * — active spokes mount the full `SpokeShell`, coming-soon spokes show a
 * lightweight "this corpus isn't surfaced yet" landing.
 *
 * Order here = order shown on the hub. We lead with litigation (the one
 * active spoke) and then group the reference corpora (USC, CFR), the
 * opinion corpus (OLC), the historical-narrative corpus (FRUS), and the
 * commentary corpus (Lawfare — the platform's first commentary spoke,
 * placed last as it's a different kind of source than the primary-source
 * corpora above it). Collection sub-spokes (per brief #7) will land in a
 * separate registry that inherits from this one when the collections
 * architecture ships.
 */
export const spokes: readonly CorpusSpoke[] = [
  litigationSpoke,
  olcSpoke,
  uscSpoke,
  cfrSpoke,
  frusSpoke,
  lawfareSpoke,
  presidentialSpoke,
  frSpoke,
]

export function getSpokeBySlug(slug: CorpusSlug): CorpusSpoke | undefined {
  return spokes.find((s) => s.slug === slug)
}

/** Active spokes are the ones a user can fully navigate today. */
export function getActiveSpokes(): readonly CorpusSpoke[] {
  return spokes.filter((s) => s.status === 'active')
}
