import type { CorpusSpoke, CorpusSlug } from '@lawfare/ragtime-client'
import { cfrSpoke } from './cfr'
import { commentarySpoke } from './commentary'
import { congressSpoke } from './congress'
import { fbiSpoke } from './fbi'
import { frSpoke } from './fr'
import { frusSpoke } from './frus'
import { litigationSpoke } from './litigation'
import { olcSpoke } from './olc'
import { presidentialSpoke } from './presidential'
import { sanctionsSpoke } from './sanctions'
import { uscSpoke } from './usc'

/**
 * Central registry of declared spokes.
 *
 * The hub reads this to render the corpus cards — one card per spoke, with
 * its holdings disclosure and an "Open →" link. Spoke routes are resolved
 * through `getSpokeBySlug`, which mounts that corpus's shell.
 *
 * Order here = order shown on the hub. We lead with litigation and then
 * group the reference corpora (USC, CFR), the
 * opinion corpus (OLC), the historical-narrative corpus (FRUS), and the
 * commentary corpus (Commentary — the federated Lawfare + Executive Functions
 * spoke, placed here as it's a different kind of source than the primary-source
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
  commentarySpoke,
  presidentialSpoke,
  frSpoke,
  congressSpoke,
  fbiSpoke,
  sanctionsSpoke,
]

export function getSpokeBySlug(slug: CorpusSlug): CorpusSpoke | undefined {
  return spokes.find((s) => s.slug === slug)
}
