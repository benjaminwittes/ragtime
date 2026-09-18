import type { DocsEntry } from '../types'

/**
 * Global "Start Here" orientation entry.
 *
 * The Explorer's credentials are the three named by the app's own
 * no-credential message (`explorer/hooks/useExplorer.ts:76`): a Lawfare
 * balance, an Anthropic key, or the demo password. A pass on 2026-09-18 cut
 * the demo password on the strength of `ExplorerPage.tsx:53`, which only
 * proves a NON-Anthropic BYOK key is refused. Do not narrow it again.
 *
 * The "Primary Sources, Not Commentary" section was its own global entry
 * (`not-commentary.ts`) until 2026-09-18, when Mary Ford asked for it to sit
 * here instead — and early, because the stakes of it are a big part of what
 * makes RAGtime RAGtime. This entry is the survivor of that merge because
 * `hub/HubKeywordSearch.tsx` deep-links `docs.open('getting-started')`.
 *
 * The "Getting Around" heading is not editorial dressing: without it the
 * hub/spoke material after the merged section would render underneath that
 * section's own `h2`.
 */
export const gettingStartedEntry: DocsEntry = {
  slug: 'getting-started',
  title: 'Start Here: What Is RAGtime?',
  summary: 'What this tool is, and the three things you can do with it.',
  scope: { kind: 'global' },
  order: 1,
  content: `
RAGtime is a research tool over public records. Ten of its eleven corpora are
primary sources: federal litigation, the U.S. Code, the Code of Federal
Regulations, Justice Department legal opinions (OLC), presidential documents
with their amendment and revocation graph, the Federal Register,
congressional material from public laws to hearing transcripts, the
documentary history of U.S. foreign relations (FRUS), the FBI's released
Vault files, and OFAC's sanctions lists and guidance. The eleventh is
commentary — Lawfare and Executive Functions — where you are searching what
named authors argued rather than the law itself.

## Primary Sources, Not Commentary

RAGtime searches and analyzes primary sources; it does not annotate them.
Three things are permanently out of scope: definitional pop-ups over
statutes, hand-curated "related authorities" or editor's notes, and in-house
explainers written as corpus content. A statute or an opinion here is the
official text, full stop, and an AI synthesis across documents is an AI
answer with citations, not an editorial gloss presented as authority.

**The eleventh corpus is commentary, by design.** That analysis is *somebody
else's*, searched as a corpus like any other. So a Commentary query surfaces
and attributes what those authors argued, and never adjudicates who was
right.

**What the AI layer will do.** Some functions, such as ranking cases by
subjective criteria, require editorial judgment from the model and carry the
usual AI risks, hallucination among them. RAGtime bounds that by keeping the
AI to descriptive accounts and requiring it to present the documents under
every claim.

## Getting Around

**The hub** is the cross-corpus entry point. **Search** fans a keyword query
across ten of the eleven corpora at once, free and without AI; use it when
you don't yet know which corpus holds your answer. (Sanctions is the one the
fan leaves out; search it from its own workspace.) **Explorer** takes a
question in your own words, plans the research, runs it, and hands you into
the corpora it used. It runs on Claude specifically, so it needs a
Lawfare-billed balance, an **Anthropic** key, or the demo password; a key for
another provider is refused before anything is sent.

**Each spoke** is one corpus's own workspace: its structured filters, its
canonical document view, and the AI modes that fit that corpus.

**Three things you can do on any corpus.** *Find* documents by keyword, and
*filter* to a working set by date, court, agency or classification: both are
local database searches and free, as is semantic search on the eight corpora
that have it. *Ask or analyze* puts an AI on the set — synthesize an answer,
read each document against a question, produce an analytical write-up — and
every output cites its sources. That runs on your own API key or a
Lawfare-billed balance, it is estimated before you run it, and Lawfare
charges $1.35 for every $1.00 of actual API usage to recoup its costs.
`.trim(),
}
