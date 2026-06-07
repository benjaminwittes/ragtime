import type { DocsEntry } from '../types'

/**
 * Litigation spoke "How to use" entry — what's in the corpus, the
 * post-1/20/2025 coverage floor and why it's there, what it's good for,
 * demo queries, and two things to know about search today.
 */
export const aboutLitigationEntry: DocsEntry = {
  slug: 'about-litigation',
  title: 'How to Use the Federal Litigation Corpus',
  summary: "What's in the litigation corpus, the coverage window, and what it's good for.",
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 9,
  content: `
**What's in it.** All federal district-court and appellate dockets — the
case metadata (parties, court, judge, dates, cause / nature-of-suit) plus
the full docket entries, and OCR text of attached filings where we have it,
filed since January 20, 2025. This floor is an arbitrary artifact of the
original use case Lawfare built this corpus for: identifying violated court
orders in immigration habeas cases during the second Trump administration.
We will push it backward over time; for now, treat the corpus as "the Trump
II era" of federal litigation. The header shows the exact last-synced date.
The corpus updates continuously but can be up to a few days behind the
current state of any given docket — so don't assume the listings include
the current day's filings. RAGtime is not a substitute for PACER or
CourtListener for up-to-the-minute docket tracking.

**What it's good for.** Tracking and analyzing live federal litigation:
who's suing whom over what, where, and how the cases are moving. Because
the set is deliberately over-inclusive (better to have a case you don't
need than to miss one), it's a strong net for "show me everything in this
space." Use it to build datasets of cases that meet easily-definable
criteria:

- How many habeas cases were there in Minnesota during the recent ICE
  surge? Limit the court to the District of Minnesota and the litigation
  type to HABEAS.
- Every criminal case in which a defendant moved for dismissal on selective-
  or vindictive-prosecution grounds? Limit to criminal cases and full-text
  search for "vindictive."
- Criminal cases brought against protesters? Limit to criminal cases, then
  ask an AI of your choice: "Show me cases in which the defendants are
  facing charges in connection with political protests."

**Demo queries to try:**

- Filter to a court and a date range, then open and read the docket of a
  specific case.
- Full-text search "preliminary injunction" or "temporary restraining
  order" across all district courts.
- Narrow to a field, then use Analyze to characterize patterns across the
  set.

**Two things to know about search today.**

- Full-text search currently runs over docket-entry descriptions, not yet
  the full text of every attached document — full-document search will land
  as the document-text backfill completes over the next several weeks.
- Searching with no court selected returns nothing; "All courts" is the
  default for a reason.
`.trim(),
}
