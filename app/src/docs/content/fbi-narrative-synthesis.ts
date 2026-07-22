import type { DocsEntry } from '../types'

/**
 * Docs entry for the FBI Records spoke's claude_ama (narrative synthesis)
 * mode. The corpus-defining conventions: describe-never-editorialize over
 * politically charged investigative records, and the no-date candor unique
 * to this corpus.
 */
export const fbiNarrativeSynthesisEntry: DocsEntry = {
  slug: 'fbi-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary:
    'Ask what the FBI’s released files show about a subject; get a synthesized narrative with cited documents and explicit caveats.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 10,
  content: `
**What it is.** The FBI Records spoke's flagship AI surface. Type a
question; the system plans a small set of queries over the preserved Vault,
runs them, and writes a narrative answer citing specific files by title and
collection.

**Good questions to ask.**

- "What's in the [COINTELPRO / Rosenberg / Amerithrax] file?" — collection
  questions are the corpus's natural shape.
- "What was removed from the Vault about [subject]?" — the recovered
  documents are filterable, and answers cite each one's Wayback capture date.
- "What do the files say about [person / event / program]?" — topical
  search across 10,700+ OCR'd documents.

**Describe, never editorialize.** These are historical FBI investigative
records — politically charged terrain. The synthesis describes what the
records show and what the Bureau wrote; it attributes claims to the records
(the FBI's own account, not adjudicated fact) and never pronounces on
guilt, innocence, or the propriety of FBI conduct.

**The no-date rule.** This corpus has NO document dates, and the synthesis
will not fake a chronology. It can report what a document's text says about
events ("the file discusses events of 1965"), but it will never claim to
know when a document was created, and it flags any time-shaped question
with a candor note instead of inventing a date filter.

**Other caveats you'll see.** OCR quality varies (quotes may contain
recognition errors, flagged when it matters); recovered documents reflect
the Vault as the Wayback Machine captured it at a moment in time; and every
count carries the coverage frame — the Vault as preserved, not all FBI
records.

**The result.** A markdown narrative + a cited-documents list rendered in
the same table as the manual filter (recovered rows keep their badge).
The "Plan" disclosure shows the exact SQL the agent ran — auditable
methodology.

**Cost.** The planning step is one model call (small); the synthesis step
is another (proportional to how much the plan pulled). The pre-flight modal
shows the estimate before every query.
`.trim(),
}
