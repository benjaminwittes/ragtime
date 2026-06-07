import type { DocsEntry } from '../types'

/**
 * Global "Primary sources, not commentary" entry — RAGtime searches and
 * analyzes primary sources but does not annotate or editorialize them.
 * Names what is permanently out of scope and what the AI layer will do.
 */
export const notCommentaryEntry: DocsEntry = {
  slug: 'not-commentary',
  title: 'Primary Sources, Not Commentary',
  summary: 'RAGtime searches and analyzes primary sources. It does not annotate or editorialize them.',
  scope: { kind: 'global' },
  order: 6,
  content: `
RAGtime's edge is cross-cutting search plus AI over primary sources — not
editorial annotation of them. So a few things are deliberately out of
scope, permanently:

- No dictionary / definitional pop-ups layered over statutes.
- No hand-curated "related authorities" or editor's notes.
- No in-house explainers or summaries written as the corpus content.

**What this means for you.** When RAGtime shows you a statute or an
opinion, you're seeing the official primary text, full stop. When AI
synthesizes across documents, that synthesis is clearly an AI answer with
citations — not an editorial gloss presented as authority.

**What the AI analytical layer will do.** You can ask the AI layer, in
various places, to analyze or summarize material in its data stack. Some AI
functions — like ranking cases by subjective criteria — inevitably require
some degree of editorial judgment on the AI's part. Such material, we
stress, is subject to all of the benefits and risks of using AI, including
the risk of hallucination and other errors. RAGtime is designed to reduce
that risk by restricting the AI to descriptive accounts of the materials in
the documents it presents, and by requiring that it present the documents
underlying every claim.
`.trim(),
}
