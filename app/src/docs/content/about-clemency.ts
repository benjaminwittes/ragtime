import type { DocsEntry } from '../types'

/**
 * Clemency surface "How to use" entry — the second table of the
 * Presidential Documents spoke (brief #11 §7). Sourcing, the provenance
 * axis, and the two data caveats.
 */
export const aboutClemencyEntry: DocsEntry = {
  slug: 'about-clemency',
  title: 'How to Use: Clemency',
  summary:
    'Presidential pardons and commutations — the provenance axis and the two data caveats.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 11,
  content: `
**What's in it.** Every presidential pardon and commutation from Nixon to
the present — 7,240 grants (about 5,000 pardons and 2,200 commutations).
Pardons are presidential acts, so clemency lives inside the Presidential
Documents spoke, reachable by the **Documents / Clemency** toggle. Source:
**Pardonpedia** (CC BY 4.0).

**The provenance axis (read this).** Each grant is tagged by where its
record comes from, and you can filter on it:

- **DOJ** — from a Department of Justice Office of the Pardon Attorney
  warrant. The canonical record.
- **Wikipedia-derived** — the recipient's *name* comes from Wikipedia, not a
  DOJ warrant. This matters most for the **January 6 pardon**: DOJ recorded
  that blanket pardon as a *class* ("certain offenses relating to the events
  of January 6"), without an individual name list, so the ~1,565 individual
  names here were assembled from Wikipedia. They carry a **Wikipedia** badge
  throughout, and the detail view says so plainly. Treat those names as
  Wikipedia-sourced, not as DOJ-confirmed.

**Two caveats the data carries:**

- **Biden's mass commutations are not yet individualized** in the source
  (≈264 records here vs. ~4,200 reported clemency actions). A count of
  Biden's grants reflects the source's coverage, not the full total.
- It's a young, single-maintainer dataset; corroborate specific grants
  against the DOJ Pardon Attorney's own records where it matters.

**Warrant text.** Where DOJ published a signed warrant, RAGtime extracts and
shows its full text on the detail view — something neither Pardonpedia nor
the DOJ list offers directly.

**Demo queries:** filter to topic "January 6"; commutations by president;
pardons where the recipient later reoffended; search an offense like "tax"
or "campaign finance."
`.trim(),
}
