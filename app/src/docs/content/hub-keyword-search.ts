import type { DocsEntry } from '../types'

/**
 * Docs entry for Search: the hub's cross-corpus fan, and the same word in a
 * corpus's own workspace. The fan covers every spoke except sanctions
 * (`HUB_KEYWORD_SPOKES`).
 *
 * The tabs carry NO captions under them — `MODES[].cost` is drawn in the
 * tab's own margin. Do not write a caption back into the prose here.
 *
 * Retitled "Search, Explained" on 2026-09-18 (Mary Ford), when the
 * keyword/semantic control came off the spokes and the entry that explained
 * that choice was deleted. The `slug` stays `hub-keyword-search`: deep links
 * are worth more than a tidy string, so do not rename it.
 *
 * Two facts to check against code before editing them, not against memory.
 * The hub fan is full-text only (`HubKeywordSearch.tsx` — no semantic call);
 * the two result panes are a SPOKE surface, live wherever a spoke descriptor
 * sets `semanticSearch` AND the spoke is registered in `spokes/registry.ts`
 * — eight of eleven, since `spokes/lawfare/index.ts` sets the flag and is
 * not mounted.
 *
 * The four-rule paragraph describes Search, the hub fan, and nothing else.
 * Since 2026-10-23 the worker parses every Search query once, under one
 * grammar, and writes it in each corpus's own syntax: Postgres websearch for
 * the hosted corpora, CourtListener's query language for federal litigation
 * (ragtime-worker `worker/keyword-query.js`; the response's `interpreted`
 * field shows the reading). So the rules hold on every corpus in the fan,
 * litigation included. The old litigation caveat measured a Postgres
 * `/corpus/filter` that litigation no longer uses; do not restore it.
 *
 * Search inside a corpus is a different surface. Its filter endpoints still
 * hand the reader's text to each engine as typed, so a lowercase "or" is OR
 * on the hosted corpora there, and litigation's filter quotes a bare
 * multi-word query for you. Do not extend the paragraph's claim to the
 * workspaces until they share the parser.
 *
 * The sanctions carve-out in the two-pane sentence is NOT redundant with the
 * descriptor check: `sanctions/index.ts` does set `semanticSearch`, but
 * `SanctionsSpokeShell.tsx` gates the semantic pane on `pane !== 'entities'`
 * and the shell opens on `'entities'`. So the corpus's default view really
 * does return one list. Do not drop that clause on the strength of the
 * descriptor alone.
 */
export const hubKeywordSearchEntry: DocsEntry = {
  slug: 'hub-keyword-search',
  title: 'Search, Explained',
  summary: 'What Search covers, how to write a query it answers well, and what it hands you afterwards.',
  scope: { kind: 'global' },
  order: 2,
  content: `
**Search** runs across {{corpora.fan}} corpora at once and returns the top five results
from each, plus the total count per corpus. Free, no AI. {{corpora.fan_primary|cap}} of the {{corpora.fan}} are
primary sources; the other is Commentary, published analysis from Lawfare and
Executive Functions. **Explorer** sends the same words to a conversation that
plans the research, runs it across the corpora and hands you into them; that
reads with AI and costs money. Switching keeps what you have typed.

**What a good query looks like.** Give Search the words you expect the
documents themselves to use — a phrase, a name, a citation: "Freedom of
Information Act", "Youngstown", "5 U.S.C. 552". When you don't know the
wording the documents use, or the question spans corpora — "where does this
credible-fear standard come from in immigration law?" pulls USC, CFR, OLC and
litigation — ask the Explorer instead.

**Four rules, the same in every corpus.** Every word you type is required.
Straight double quotes match words in sequence: "Freedom of Information Act"
finds those words together, not scattered through a document. A leading
minus excludes a word or a quoted phrase: \`habeas -corpus\` returns what
holds the first word and not the second. \`OR\` in capitals returns either of
the two words beside it: \`AUMF OR authorization\`. Search ignores common
words such as *the*, *of*, *and* and *or*.

**{{corpora.fan|cap}} of the {{corpora.held}} corpora.** Sanctions sits out the fan, because its
documents include the Federal Register's sanctions notices, which that
section already returns. Search Sanctions from its own workspace, where the
entity lists and OFAC's guidance are searchable too.

**Results are grouped by corpus rather than merged into one ranking**, since
each corpus scores relevance off its own index and those scores are not
comparable. Nothing narrows the fan: every Search query goes to all {{corpora.fan}}, and
the narrowing happens afterwards.

**Inside a corpus, search does more.** Open the section that holds your
answer and you get more than five results, structured filters, the full
document view, and that corpus's own AI modes. Most corpora return results
in two panes — one matching your exact words, one matching your meaning — so
you can see why each document came back, and a document in both panes is the
strongest kind of result. The U.S. Code, the CFR, federal litigation and the
sanctions entity list match words only. Structured filters shape the first
pane; the second reads your search text alone. Where a corpus is still
loading, new documents are searchable by word at once and by meaning once
the embedding queue catches up.
`.trim(),
}
