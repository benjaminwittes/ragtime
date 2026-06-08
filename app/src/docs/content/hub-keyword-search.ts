import type { DocsEntry } from '../types'

/**
 * Docs entry for the hub cross-corpus keyword search. Global-scope (visible
 * on every surface), because the hub search routes users into the spokes.
 *
 * First global entry in the registry — prior entries are all spoke-scoped.
 * The hub keyword search is brief #1's free demo moment and the most-used
 * surface; it deserves docs context users can pull up anywhere.
 */
export const hubKeywordSearchEntry: DocsEntry = {
  slug: 'hub-keyword-search',
  title: 'Cross-Corpus Keyword Search',
  summary: 'How the free hub-level keyword search works, and how it routes to the specialized spokes.',
  scope: { kind: 'global' },
  order: 2,
  content: `
**What it is.** The plain-language box at the top of the hub. Type a
question or a topic; the system fires six parallel full-text searches
(one per corpus — Federal litigation, USC, CFR, OLC, FRUS, and Lawfare)
and returns the top-5 results from each, plus the total count per corpus.
Free, no AI. (Five of the six are primary sources; Lawfare returns its own
published commentary — handy for "has anyone written about this?")

**Why grouped by corpus, not one merged list?** Each corpus's relevance
scores come from its own full-text index and aren't comparable across
tables — a merged ranking would be quietly misleading. Grouping is
honest, reads clearly, and doubles as routing ("mostly CFR → open the
CFR workspace").

**The chips at the bottom of the search box** let you toggle which
corpora are searched. All are on by default. Turning off CFR + FRUS
narrows to legal-doctrinal corpora; turning off everything except FRUS
gives you a historical-only view.

**Opening a workspace.** Each result card has an "Open workspace →" link
that takes you to that corpus's full surface. In the workspace you can:
- See more than the 5 hub-level previews.
- Add structured filters (date range, court, agency, classification).
- Click into the canonical document view (with full text, hierarchy,
  provenance).
- Use the corpus-specific AI mode (Ask, narrative synthesis, legal
  analysis) where available.

**What's deferred.** This is the keyword tier. The brief's paid AI
synthesis layer — a cited cross-corpus answer written from these search
results — needs semantic retrieval (pgvector) to provide a single
comparable relevance score across the tables. That lands later. For
now, the keyword tier stands on its own.

**Why this matters.** Most real research questions span corpora — "Where
does this credible-fear standard come from in immigration law?" pulls
USC, CFR, OLC, and litigation. The hub is the only coherent
cross-everything entry point because the corpora share no common
facets. Use it when you don't know which corpus holds the answer.
`.trim(),
}
