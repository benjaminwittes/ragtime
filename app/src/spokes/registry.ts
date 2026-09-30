import {
  CORPORA,
  HUB_GROUPS,
  type CorpusSlug,
  type CorpusSpoke,
  type HubCardSlug,
} from '@lawfare/ragtime-client'
import { booksSpoke } from './books'
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
 * Central registry of declared spokes, in five groups.
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
 * a reader who mistakes it for one has been misled by the page. **The
 * catalogue** stands apart for the opposite reason: it is not a source of
 * text at all. It records that books exist and what the Library says they are
 * about, and a reader who expects to quote from it has been misled too.
 *
 * Order within a group, and the order of the groups, is the order shown on
 * the hub — `spokes` is derived from `spokeGroups` rather than kept beside
 * it, so there is one place to change it and no way for the two to disagree.
 * Collection sub-spokes (per brief #7) will land in a separate registry that
 * inherits from this one when the collections architecture ships.
 */
/**
 * The UI for each corpus that has a hub card. Typed by the registry's own list
 * of hub slugs, so a corpus the Worker gives a card with no entry here is a
 * compile error, never a card that silently fails to appear (the book
 * catalogue shipped that way before this list was derived).
 */
const spokeImplementations: Record<HubCardSlug, CorpusSpoke> = {
  usc: uscSpoke,
  cfr: cfrSpoke,
  congress: congressSpoke,
  fr: frSpoke,
  presidential: presidentialSpoke,
  olc: olcSpoke,
  litigation: litigationSpoke,
  frus: frusSpoke,
  fbi: fbiSpoke,
  sanctions: sanctionsSpoke,
  commentary: commentarySpoke,
  books: booksSpoke,
}

/** The hub's title for a corpus is the registry's, not the spoke module's own. */
function hubTitle(slug: string): string {
  const entry = CORPORA.find((c) => c.slug === slug)
  if (!entry || !entry.hub) throw new Error(`spokes/registry: ${slug} has no hub title in the generated registry`)
  return entry.hub.title
}

/**
 * The hub's groups: headings, order and membership all come from the Worker
 * registry (generated into the client package). Only the spoke UI is written
 * here.
 */
export const spokeGroups: readonly {
  heading: string
  spokes: readonly CorpusSpoke[]
}[] = HUB_GROUPS.map((group) => ({
  heading: group.heading,
  spokes: group.corpora.map((slug) => {
    const spoke = spokeImplementations[slug as HubCardSlug]
    if (!spoke) throw new Error(`spokes/registry: no spoke implementation for hub corpus ${slug}`)
    return { ...spoke, title: hubTitle(slug) }
  }),
}))

export const spokes: readonly CorpusSpoke[] = spokeGroups.flatMap(
  (g) => g.spokes,
)

export function getSpokeBySlug(slug: CorpusSlug): CorpusSpoke | undefined {
  return spokes.find((s) => s.slug === slug)
}
