import type { DocsEntry } from '../types'

/** FBI Records claude_ama mode. The no-date rule is load-bearing. */
export const fbiNarrativeSynthesisEntry: DocsEntry = {
  slug: 'fbi-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'Ask what the released files show; get a cited narrative with explicit caveats.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 10,
  content: `
**What it is.** Type a question; the system plans a small set of queries over
the preserved Vault, runs them, and writes a narrative answer citing files by
title and collection. The Plan disclosure shows the SQL it ran.

**Good questions to ask.**

- "What's in the [COINTELPRO / Rosenberg / Amerithrax] file?" — collection
  questions are the corpus's natural shape.
- "What was removed from the Vault about [subject]?" — the recovered
  documents are filterable, and answers cite each one's Wayback capture date.
- "What do the files say about [person / event / program]?" — topical
  search across 10,700+ OCR'd documents.

**Describe, never editorialize.** These are historical FBI investigative
records on politically charged terrain. The synthesis describes what the
records show and what the Bureau wrote, attributes claims to the records
rather than to adjudicated fact, and never pronounces on guilt, innocence or
the propriety of FBI conduct.

**The no-date rule.** This corpus has no document dates and the synthesis
will not fake a chronology. It can report what a document's text says about
events ("the file discusses events of 1965") but never when a document was
created, and it answers a time-shaped question with a candor note rather than
inventing a date filter.

**Other caveats.** OCR errors may sit inside quoted text, flagged when they
matter. Recovered documents reflect the Vault as one Wayback capture found
it. Every count carries the coverage frame: the Vault as preserved, not all
FBI records.
`.trim(),
}
