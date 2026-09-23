import type { DocsEntry } from '../types'

/** FRUS spoke "How to use" entry. */
export const aboutFrusEntry: DocsEntry = {
  slug: 'about-frus',
  title: 'How to Use: FRUS (Diplomatic History)',
  summary: 'The official documentary record of U.S. foreign relations — scope, eras, and how to read it.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 9,
  content: `
**What's in it.** Foreign Relations of the United States — the State
Department's official documentary history of U.S. foreign policy: cables,
memos, minutes and reports. 314,000+ documents across 694 volumes, spanning
1620 to 1991. It is organized by volume, each covering an era plus a region
plus a topic ("1969–1976, Vietnam"), so the corpus's own editorial structure
is the navigation.

**Reading the documents.** Original classification markings and the editors'
footnotes are preserved; they are part of the scholarly value, not noise.
Named persons are surfaced so you can see who is in a document.

**What it cannot tell you.** This is a curated record assembled by State
Department historians, not a raw archive, and it ends in 1991. It is also
self-contained: there are no cross-links to the modern legal corpora. It
works as a stand-alone corpus, and alongside OLC.

**Demo queries:** "U.S. policy toward the Cuban Missile Crisis"; "U.S.
annexation of Hawaii"; summarize a specific cable.
`.trim(),
}
