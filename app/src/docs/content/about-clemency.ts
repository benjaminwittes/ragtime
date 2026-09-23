import type { DocsEntry } from '../types'

/** Clemency — the second table of the Presidential Documents spoke. */
export const aboutClemencyEntry: DocsEntry = {
  slug: 'about-clemency',
  title: 'How to Use: Clemency',
  summary: 'Presidential pardons and commutations — the provenance axis and two caveats.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 11,
  content: `
**What's in it.** Every presidential pardon and commutation from Nixon to the
present — 7,240 grants, about 5,000 pardons and 2,200 commutations. Pardons
are presidential acts, so clemency sits inside the Presidential Documents
spoke. Source: **Pardonpedia** (CC BY 4.0).

**The provenance axis**, which you can filter on. A **DOJ** record comes from
an Office of the Pardon Attorney warrant and is canonical. A
**Wikipedia-derived** record means the recipient's *name* came from
Wikipedia, not a warrant. That matters most for the **January 6 pardon**: DOJ
recorded it as a *class*, with no individual name list, so the ~1,565 names
here were assembled from Wikipedia. They carry a Wikipedia badge — treat them
as Wikipedia-sourced, not DOJ-confirmed.

**Two caveats the data carries.** Biden's mass commutations are not
individualized in the source: about 264 records here against roughly 4,200
reported clemency actions, so a count of Biden's grants reflects coverage
rather than the total. And it is a young, single-maintainer dataset —
corroborate specific grants against the DOJ Pardon Attorney's records where
it matters.

**Warrant text.** Where DOJ published a signed warrant, RAGtime extracts its
full text onto the detail view, which neither Pardonpedia nor the DOJ list
offers directly.

**Demo queries:** filter to topic "January 6"; commutations by president;
pardons where the recipient later reoffended; search an offense like "tax"
or "campaign finance."
`.trim(),
}
