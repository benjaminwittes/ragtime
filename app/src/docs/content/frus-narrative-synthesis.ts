import type { DocsEntry } from '../types'

/** FRUS claude_ama mode — one planner, three output shapes. */
export const frusNarrativeSynthesisEntry: DocsEntry = {
  slug: 'frus-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'Tell-me-about questions over the State Department documentary record.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 10,
  content: `
**What it is.** Type a question; the planner recognizes its shape, writes SQL
against the documentary record, and returns chronological prose with inline
citations. Each citation carries the full chain — volume, document number,
title, date, place, classification — and opens the document.

**Three shapes.** *"Tell me about [event / era / person / policy]"* returns a
prose chronology ordered by date, with persons, places and classification
attributed inline. *"Has the U.S. ever done X?"* returns a yes-or-no verdict
plus its supporting documents; for a *no*, the candor notes list the search
terms and date ranges tried, so you can interrogate the formulation. *"Show
me the cables on Y"* is a scoped lookup. Analytical questions work too, and
the denominator is always stated: *"of 314,483 documents in the corpus, 437
mention Stalin in that range."*

**Editorial conventions.** FRUS terrain includes covert operations,
regime-change involvement and contested intelligence judgments. The synthesis
describes and cites; it never opines. Classification is quoted verbatim when
it signals something, including the inverse signal of a document marked
UNCLASSIFIED on a sensitive topic.

**What the planner cannot reach.** It writes SQL, so its reach is the words
in the record. Questions about *events* (Berlin Airlift, Bay of Pigs, Suez)
land well; questions about *concepts* (containment, deterrence) depend on
whether the cables used your word. Plain search here has a Semantic setting
the planner does not use, so for a conceptual sweep, find the documents
semantically first and then ask about what you found.
`.trim(),
}
