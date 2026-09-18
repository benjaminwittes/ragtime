import type { DocsEntry } from '../types'

/** Global "Primary sources, not commentary" entry. */
export const notCommentaryEntry: DocsEntry = {
  slug: 'not-commentary',
  title: 'Primary Sources, Not Commentary',
  summary: 'RAGtime searches and analyzes primary sources. It does not annotate or editorialize them.',
  scope: { kind: 'global' },
  order: 7,
  content: `
RAGtime searches and analyzes primary sources; it does not annotate them.
Three things are permanently out of scope: definitional pop-ups over
statutes, hand-curated "related authorities" or editor's notes, and in-house
explainers written as corpus content. A statute or an opinion here is the
official text, full stop, and an AI synthesis across documents is an AI
answer with citations, not an editorial gloss presented as authority.

**One corpus is commentary, by design.** Commentary returns published
analysis from Lawfare and Executive Functions. That is analysis — but it is
*somebody else's*, searched as a corpus like any other. So a Commentary query
surfaces and attributes what those authors argued, and never adjudicates who
was right.

**What the AI layer will do.** Some functions, such as ranking cases by
subjective criteria, require editorial judgment from the model and carry the
usual AI risks, hallucination among them. RAGtime bounds that by keeping the
AI to descriptive accounts and requiring it to present the documents under
every claim.
`.trim(),
}
