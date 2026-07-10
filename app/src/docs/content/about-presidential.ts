import type { DocsEntry } from '../types'

/**
 * Presidential Documents spoke "How to use" entry — what the corpus
 * contains, the coverage-asymmetry caveats, the disposition graph, and how
 * to search it (brief #11).
 */
export const aboutPresidentialEntry: DocsEntry = {
  slug: 'about-presidential',
  title: 'How to Use: Presidential Documents',
  summary:
    'What the presidential-documents corpus contains, the coverage caveats, and the amendment/revocation graph.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 9,
  content: `
**What's in it.** The formal signed instruments by which the President
directs the executive branch and the public, as published in the Federal
Register: executive orders (5,900+, reaching back to 1940), proclamations
(4,400), memoranda (800), determinations (790), and notices (770) — about
12,700 documents in all, updated daily. (Exact live counts appear on the
corpus card and in the spoke's holdings band.)

**The lineage graph.** The Office of the Federal Register tracks what each
document does to earlier ones — revokes, amends, supersedes — and this
corpus parses that record into a queryable graph (14,000+ edges). That's
what powers "is this executive order still in effect," the amendment
trail on every document's detail view, and questions like "how many of one
president's orders did the next president revoke." One honesty rule
throughout: the graph records *explicit* dispositions, so "no recorded
revocation" is not proof a document remains in effect.

**Two coverage caveats to keep in mind:**

- **Executive orders reach back to 1940, but the other four types only
  begin in 1993/94** (the Federal Register API's floor for those types).
  A count of, say, Truman's proclamations reflects the corpus floor, not
  history — the system flags this on count questions.
- **Executive orders from 1940–1947 are finding-aid entries** — the
  corpus knows they exist and what later documents did to them, but their
  text isn't digitized yet (historical backfill in progress). They carry a
  "finding aid" badge and link to the original at the Federal Register /
  National Archives. Text for 1948–1993 comes from the Department of
  Justice's retired JURIS research system — typed text, not scans.

**Searching tip.** Presidential documents use formal register: a
"travel ban" appears as "suspension of entry"; "sanctions" appear as
"blocking property" under a "national emergency." The Semantic search mode
(and the AI synthesis mode) bridge that vocabulary gap; plain keyword
search may need the document's own phrasing.

**Demo queries:** "Is EO 12333 still in effect?"; "How many of Biden's
executive orders did Trump revoke?"; filter to one president's memoranda;
trace presidential action on classified information.
`.trim(),
}
