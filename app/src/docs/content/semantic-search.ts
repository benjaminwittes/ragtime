import type { DocsEntry } from '../types'

/**
 * Docs entry for the keyword / semantic / both retrieval toggle. It renders
 * on every spoke whose descriptor sets `semanticSearch` AND that is
 * registered in `spokes/registry.ts` — eight of the eleven.
 * `spokes/lawfare/index.ts` sets the flag and does NOT count, because nothing
 * mounts that spoke. Re-derive the list from those two facts.
 */
export const semanticSearchEntry: DocsEntry = {
  slug: 'semantic-search',
  title: 'Keyword vs. Semantic Search',
  summary: 'Matching your words, matching your meaning, or both side by side.',
  scope: { kind: 'global' },
  order: 3,
  content: `
Where a corpus supports it, **Search by** offers three settings.

- **Keyword** matches your exact words. Best for names, citations and precise
  phrases ("Youngstown", "50 U.S.C. 1702").
- **Semantic** matches your *meaning*, so "can the president fire agency
  heads" finds removal-power opinions that never use the word "fire". Best
  for concepts and doctrines.
- **Both** (the default) runs the two at once, in separate panes, because
  their relevance scores are not comparable. A document in both panes is
  badged as such, and that is the strongest kind of result.

**What semantic search reads.** The search text only. Structured filters
apply to the keyword pane and do not constrain the semantic pane in this
version, so a filter-bounded set needs Keyword mode.

**Where it exists.** Eight of the eleven corpora: OLC, FRUS, Commentary,
Presidential Documents, the Federal Register, Congress, FBI Records and
Sanctions. The U.S. Code, the CFR and federal litigation have keyword search
only, and show no Search by row at all. Where a corpus is still loading, new
documents are keyword-searchable at once and semantically searchable once the
embedding queue catches up. Searching is free in every mode.
`.trim(),
}
