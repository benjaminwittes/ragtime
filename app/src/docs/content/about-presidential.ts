import type { DocsEntry } from '../types'

/**
 * Presidential Documents spoke "How to use" entry. The hub card's count is
 * ROUNDED by design; the figures here are exact and read live (docs/figures.ts).
 * The 1940–1947 finding-aid and 1993/94 floor years are source facts, not counts.
 */
export const aboutPresidentialEntry: DocsEntry = {
  slug: 'about-presidential',
  title: 'How to Use: Presidential Documents',
  summary: 'What the corpus holds, its coverage caveats, and the amendment/revocation graph.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 9,
  content: `
**What's in it.** The formal signed instruments by which the President
directs the executive branch and the public, as published in the Federal
Register: executive orders ({{presidential.executive_orders}}, reaching back to {{presidential.since}}), proclamations
({{presidential.proclamations}}), memoranda ({{presidential.memoranda}}), determinations ({{presidential.determinations}}) and notices ({{presidential.notices}}) —
{{presidential.documents}} documents, updated daily. The count on the hub is rounded on purpose.

**The lineage graph.** The Office of the Federal Register tracks what each
document does to earlier ones — revokes, amends, supersedes — and the corpus
parses that into a queryable graph of those edges. It powers "is this
executive order still in effect", the amendment trail on every document, and
questions like how many of one president's orders the next revoked. The graph
records *explicit* dispositions only, so "no recorded revocation" is not
proof a document remains in effect.

**Two coverage caveats.** Executive orders reach back to {{presidential.since}}, but the other
four types begin in 1993/94, the Federal Register API's floor for them, so a
count of Truman's proclamations reflects the corpus floor rather than history
— and the system flags that. And executive orders from 1940–1947 are
finding-aid entries: the corpus knows they exist and what later documents did
to them, but their text is not digitized, so they carry a badge and link to
the original. Text for 1948–1993 comes from the Justice Department's retired
JURIS system.

**Searching tip.** These documents use formal register: a "travel ban"
appears as "suspension of entry", sanctions as "blocking property" under a
"national emergency". Semantic search and the AI synthesis bridge that gap.

**Demo queries:** "Is EO 12333 still in effect?"; "How many of Biden's
executive orders did Trump revoke?"; filter to one president's memoranda;
trace presidential action on classified information.
`.trim(),
}
