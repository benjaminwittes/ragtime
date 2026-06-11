import type { DocsEntry } from '../types'

/**
 * Docs entry for the keyword / semantic / both retrieval toggle (brief #9,
 * locked 2026-06-11). Global-scope: the toggle renders on every embedded
 * spoke (OLC, FRUS, Lawfare today) and reads identically on each, and its
 * DocsHint deep-links here from all of them.
 */
export const semanticSearchEntry: DocsEntry = {
  slug: 'semantic-search',
  title: 'Keyword vs. Semantic Search',
  summary:
    'What the Search-by toggle does: matching your words, matching your meaning, or both side by side.',
  scope: { kind: 'global' },
  order: 3,
  content: `
**What it is.** On corpora that support it, the search surface has a
"Search by" toggle with three settings:

- **Keyword** matches your exact words using full-text search. Best for
  names, citations, and precise phrases ("Youngstown", "50 U.S.C. 1702").
- **Semantic** matches your *meaning*. Every document has been mapped into
  a vector space where conceptually similar passages sit near each other,
  so a search for "can the president fire agency heads" finds removal-power
  opinions that never use the word "fire". Best for concepts and doctrines.
- **Both** (the default) runs the two searches at once and shows the
  results side by side — you never have to run a search twice to get the
  full picture.

**Why two separate panes instead of one merged list?** The two methods
score relevance in incomparable ways, and *which* method found a document
is itself useful information. "Matched your words" tells you the term is
actually present; "matched your meaning" tells you the ideas align. A
merged list would hide that distinction.

**The overlap badge.** A document that appears in both panes is the
strongest kind of result — it carries an "also a keyword match" /
"also a semantic match" badge rather than being shown only once.

**What semantic search reads.** The search text only. Structured filters
(date ranges, author, source, topic…) apply to the keyword pane but do
not constrain the semantic pane in this version — if you need a
filter-bounded set, use Keyword mode or read the semantic pane knowing
it spans the whole corpus.

**Where it's available.** Corpora whose documents have been embedded:
OLC opinions, FRUS, and Lawfare today; more as embedding coverage grows.
Searches in any mode are free.
`,
}
