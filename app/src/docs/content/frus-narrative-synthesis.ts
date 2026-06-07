import type { DocsEntry } from '../types'

/**
 * Docs entry for the FRUS spoke's claude_ama (narrative synthesis) mode.
 *
 * Brief #5 §3 names three asymmetric flagships served via ONE mode whose
 * planner picks output_mode per question shape — narrative (the
 * paradigmatic flagship), hybrid (coverage/existence with supporting docs),
 * or list (specific document retrieval). This entry explains what each
 * shape is good for and the FRUS-specific editorial conventions.
 */
export const frusNarrativeSynthesisEntry: DocsEntry = {
  slug: 'frus-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'Tell-me-about questions over the State Department documentary record.',
  scope: { kind: 'spoke', spokeSlug: 'frus' },
  order: 10,
  content: `
**What it is.** FRUS's flagship AI surface. Type a question; the planner
recognizes the question shape (narrative / coverage / retrieval) and writes
SQL against the documentary record. Synthesis returns chronological prose
with inline citations to specific documents.

**The three shapes (recognized internally, no buttons).**

- *"Tell me about [event / era / person / policy]"* — **narrative**. Prose
  chronology with events ordered by date; persons + places + classification
  attributed inline; documents-as-citations woven in. The paradigmatic
  flagship.
- *"Has the U.S. ever [done X] / Did [administration] [do Y]"* — **coverage
  / existence**. Yes-or-no synthesized verdict + the supporting documents.
  For *no* answers, the candor notes surface the search dataset (which FTS
  terms / date ranges were tried) so you can interrogate the formulation.
- *"Show me [docs about X] / Find the cables on [Y]"* — **specific document
  retrieval**. Scoped lookup; synthesis narrows the result.

**Analytical questions** (*"How many documents mention Stalin between 1948
and 1955?"*, *"Which administration produced the most documents about
Berlin?"*) work too. The denominator is always surfaced — *"Of 314,483
documents in the corpus, 437 mention Stalin in that range."*

**Citations.** Each citation carries the full chain: volume + document
number + title + date + place + classification. Click a "Doc #N" button
below the answer to read the full document in the side sheet.

**Editorial conventions.** FRUS terrain includes covert operations,
regime-change involvement, contested intelligence judgments — the synthesis
describes and cites, never opines. Classification levels are surfaced
verbatim when interesting (a document marked SECRET at the time, or — for
the inverse signal — a document marked UNCLASSIFIED on a sensitive topic).
Person attribution is explicit when the TEI extraction made it possible.

**Phase 2: semantic retrieval.** FRUS questions about *concepts*
(containment, deterrence, "the special relationship") benefit substantially
from semantic retrieval that v1 keyword search underperforms on. Questions
about specific *events* (Berlin Airlift, Bay of Pigs, Suez) work well now.
The semantic-retrieval upgrade is on the post-beta roadmap.

**Cost.** Plan call + synthesis call. The pre-flight modal shows the
estimate before every query — refine the question if the scope is larger
than you intended, or opt out via its "don't show again" checkbox.
`.trim(),
}
