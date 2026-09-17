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
 * Central registry of declared spokes, in four groups.
 *
 * The hub renders these groups under their headings, one entry per spoke;
 * spoke routes are resolved through `getSpokeBySlug`, which mounts that
 * corpus's shell.
 *
 * The grouping is an argument about where a document comes from, and it is
 * the only thing the hub asks the reader to hold. **The law** is the rules
 * themselves and the record of their making: the statutes, the regulations
 * written under them, the Congress that passed them, the daily journal in
 * which the executive proposes and finalises them, and the President's own
 * signed instruments. **As read** is the two corpora that do nothing but
 * interpret those rules — the Justice Department advising the executive on
 * what it may do, and the courts deciding it. **The record** is what
 * government actually did under all of that, once the files came out:
 * diplomacy, the Bureau's FOIA releases, the Treasury's designations.
 * **Commentary** stands apart because it is not a primary source at all, and
 * a reader who mistakes it for one has been misled by the page.
 *
 * Order within a group, and the order of the groups, is the order shown on
 * the hub — `spokes` is derived from `spokeGroups` rather than kept beside
 * it, so there is one place to change it and no way for the two to disagree.
 * Collection sub-spokes (per brief #7) will land in a separate registry that
 * inherits from this one when the collections architecture ships.
 */
export const spokeGroups: readonly {
  heading: string
  spokes: readonly CorpusSpoke[]
}[] = [
  {
    heading: 'The law',
    spokes: [uscSpoke, cfrSpoke, congressSpoke, frSpoke, presidentialSpoke],
  },
  {
    heading: 'As read',
    spokes: [olcSpoke, litigationSpoke],
  },
  {
    heading: 'The record',
    spokes: [frusSpoke, fbiSpoke, sanctionsSpoke],
  },
  {
    heading: 'Commentary',
    spokes: [commentarySpoke],
  },
]

export const spokes: readonly CorpusSpoke[] = spokeGroups.flatMap(
  (g) => g.spokes,
)

export function getSpokeBySlug(slug: CorpusSlug): CorpusSpoke | undefined {
  return spokes.find((s) => s.slug === slug)
}
