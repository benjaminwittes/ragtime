import type { DocsEntry } from '../types'

/**
 * Docs entry for the hub cross-corpus keyword search. Global-scope (visible
 * on every surface), because the hub search routes users into the spokes.
 *
 * This entry describes the Search mode of the hub's box, which is the mode it
 * opens in. The other one hands the same words to the Explorer and is described
 * where the Explorer is (`getting-started`, `explorer-*`) — the box is one
 * field with two destinations, not two features (`hub/HubKeywordSearch.tsx`).
 * The chip row that once let a reader pick corpora is gone; the fan covers
 * every spoke except sanctions (`HUB_KEYWORD_SPOKES`), so the counts below
 * track `spokes/registry.ts` and that one exclusion.
 */
export const hubKeywordSearchEntry: DocsEntry = {
  slug: 'hub-keyword-search',
  title: 'Cross-Corpus Keyword Search',
  summary: 'How the free hub-level keyword search works, and how it routes to the specialized spokes.',
  scope: { kind: 'global' },
  order: 2,
  content: `
**What it is.** The hub's one box, in **Search** mode — the mode it opens
in, and one of the two tabs above it. Type a phrase or a topic; the system
fires a parallel full-text search across ten corpora — from federal
litigation to the Congressional Record — and returns the top-5 results
from each, plus the total count per corpus. Free, no AI. (Nine of the ten
are primary sources; the tenth is Commentary, which returns published
analysis from Lawfare and Executive Functions — handy for "has anyone
written about this?")

**The other tab.** **Explorer** takes the same box and sends what you
typed to the Explorer instead, where a conversation plans the research,
runs it across the corpora, and hands you into them. That one reads with
AI and costs money; this one does not. Switching tabs keeps whatever you
have typed.

**Ten of the eleven corpora.** Sanctions sits out the fan. Its documents
include the Federal Register's sanctions notices, which the Federal
Register section already returns, so fanning both would show you the same
notices twice. Search Sanctions from its own workspace, where the entity
lists and OFAC's guidance are searchable too.

**Why grouped by corpus, not one merged list?** Each corpus's relevance
scores come from its own full-text index and aren't comparable across
tables — a merged ranking would be quietly misleading. Grouping is
honest, reads clearly, and doubles as routing ("mostly CFR → open the
CFR workspace").

**There is nothing to narrow.** The tabs choose where your words go; they
do not choose which corpora are searched. Every query in Search mode goes
to all ten, and no control narrows that. The narrowing happens after the
search instead: each corpus is its own section with its own count, so you
can see which ones hold your answer and open the one that does.

**Opening a workspace.** Each corpus section has an "Open workspace →" link
that takes you to that corpus's full surface. In the workspace you can:
- See more than the 5 hub-level previews.
- Add structured filters (date range, court, agency, classification).
- Click into the canonical document view (with full text, hierarchy,
  provenance).
- Use the corpus-specific AI mode (Ask, narrative synthesis, legal
  analysis) where available.

**Search here, or ask?** That is what the two tabs are for. Search matches
words, so use it when you have a phrase, a name, or a citation you expect
to appear verbatim ("Youngstown", "50 U.S.C. 1702") — and the placeholder
cycles through examples of exactly that, one per corpus, which Tab will
put in the box for you. When the question is in your own words and you
don't know the wording the documents use, switch to Explorer and ask it:
that is a conversation which researches across the corpora and hands you
off into them. Each corpus workspace also has its own AI modes once you
know where you're looking. Those read with AI; Search doesn't.

**Why this matters.** Most real research questions span corpora — "Where
does this credible-fear standard come from in immigration law?" pulls
USC, CFR, OLC, and litigation. The corpora share no common facets, so no
single filter runs across them. Use the hub search when you don't know
which corpus holds the answer.
`.trim(),
}
