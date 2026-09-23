import type { DocsEntry } from '../types'

/**
 * USC claude_ama mode. USC genuinely has no semantic search — the "keyword
 * only" paragraph is correct, not a leftover.
 */
export const uscAiSynthesisEntry: DocsEntry = {
  slug: 'usc-ai-synthesis',
  title: 'Legal-Analysis Synthesis (AMA Mode)',
  summary: 'Ask USC-shaped legal questions; get a cited analysis across the relevant sections.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 10,
  content: `
**What it is.** Type a question; the planner recognizes its shape, writes SQL
against the codified statutes, and returns a legal analysis with inline
citations to specific sections.

**The shapes it recognizes.** *"Is it lawful for X to do Y?"* pulls the
cluster of sections bearing on the question. *"Can the President or agency X
do Y?"* pulls the statutory authorities — and only those; implementing
regulations (CFR), executive interpretation (OLC) and litigation are not
cross-referenced, and the answer says so. *"Summarize federal law on
[domain]"* scopes by title. *"What does 8 U.S.C. § 1225 say?"* is a citation
lookup, and *"how many federal laws carry criminal penalties?"* is
analytical, surfacing its denominator and matching pattern.

**Editorial conventions.** Every analysis carries the release-point caveat:
changes since the release the corpus holds are not reflected. Where it leans
on a non-positive-law title (Title 26, Title 50) it says so, since the
binding text there is the Statutes at Large. Where the answer turns
substantially on Article II or the Bill of Rights it says so too, rather than
answering as though the constitutional dimension were absent.

**Keyword only, on this corpus.** The U.S. Code has no semantic search, and
the planner writes SQL. Ask for the provision, the actor or the citation and
it finds the cluster around them; ask for a principle and you are relying on
the Code having used your word.
`.trim(),
}
