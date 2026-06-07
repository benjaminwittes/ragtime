import type { DocsEntry } from '../types'

/**
 * FRUS spoke "How to use" entry — the State Department's official
 * documentary history: what's in it, how it's organized by volume, the
 * paradigmatic narrative-synthesis mode, how to read the documents, and
 * the self-contained-historical-record caveats.
 */
export const aboutFrusEntry: DocsEntry = {
  slug: 'about-frus',
  title: 'How to Use: FRUS (Diplomatic History)',
  summary: 'The official documentary record of U.S. foreign relations — scope, eras, and how to read it.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 9,
  content: `
**What's in it.** Foreign Relations of the United States — the State
Department's official documentary history of U.S. foreign policy: cables,
memos, minutes, and reports, organized into editorial volumes. 314,000+
documents across 694 volumes, spanning 1620 to 1991.

**How it's organized.** By volume, where each volume covers an era plus a
region plus a topic (e.g., "1969–1976, Vietnam"). The scopes you can browse
are derived directly from the volumes — so the corpus's own editorial
structure is the navigation.

**What it's good for — and the primary mode.** FRUS rewards narrative
synthesis: "trace the U.S. decision-making around X." That's the
paradigmatic AI mode here. You can also do documentary-coverage questions
("what's in the record on Y") and pinpoint retrieval of specific documents.

**Reading the documents.** Original classification markings and the
editors' footnotes are preserved on the document view — they're part of the
historical and scholarly value, not noise. Named persons are surfaced as a
citation affordance so you can see who's in a given document.

**What to keep in mind.** This is a curated historical record assembled by
State Department historians, not a raw archive — and it ends in 1991. It's
self-contained: there are no cross-links to the modern legal corpora, at
least not yet. It works most effectively as a stand-alone corpus, and in
combination with the OLC corpus.

**Demo queries:** "U.S. policy toward the Cuban Missile Crisis"; "U.S.
annexation of Hawaii"; summarize a specific cable.
`.trim(),
}
