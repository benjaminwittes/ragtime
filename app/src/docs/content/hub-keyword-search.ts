import type { DocsEntry } from '../types'

/**
 * Docs entry for the hub cross-corpus keyword search. The fan covers every
 * spoke except sanctions (`HUB_KEYWORD_SPOKES`).
 *
 * The tabs carry NO captions under them — `MODES[].cost` is drawn in the
 * tab's own margin. Do not write a caption back into the prose here.
 */
export const hubKeywordSearchEntry: DocsEntry = {
  slug: 'hub-keyword-search',
  title: 'Cross-Corpus Keyword Search',
  summary: 'How the free hub-level keyword search works, and how it routes to the specialized spokes.',
  scope: { kind: 'global' },
  order: 2,
  content: `
**Search** runs a full-text search across ten corpora at once and returns the
top five results from each, plus the total count per corpus. Free, no AI.
Nine of the ten are primary sources; the tenth is Commentary, published
analysis from Lawfare and Executive Functions. **Explorer** sends the same
words to a conversation that plans the research, runs it across the corpora
and hands you into them; that reads with AI and costs money. Switching keeps
what you have typed.

**Ten of the eleven corpora.** Sanctions sits out the fan, because its
documents include the Federal Register's sanctions notices, which that
section already returns. Search Sanctions from its own workspace, where the
entity lists and OFAC's guidance are searchable too.

**Results are grouped by corpus rather than merged into one ranking**, since
each corpus scores relevance off its own index and those scores are not
comparable. Nothing narrows the fan: every Search query goes to all ten, and
the narrowing happens afterwards. Open the section that holds your answer and
you get more than five results, structured filters, the full document view,
and that corpus's own AI modes.

**Which one to use.** Search matches words, so use it for a phrase, a name or
a citation you expect verbatim: "Freedom of Information Act", "5 U.S.C. 552".
When you don't know the wording the documents use, ask the Explorer. Most
real questions span corpora — "where does this credible-fear standard come
from in immigration law?" pulls USC, CFR, OLC and litigation — and no single
filter runs across them.
`.trim(),
}
