import type { DocsEntry } from '../types'

/**
 * Litigation spoke "How to use" entry — what's in the corpus (served live
 * from CourtListener, all dates), what it's good for, demo queries, and two
 * things to know about search today.
 */
export const aboutLitigationEntry: DocsEntry = {
  slug: 'about-litigation',
  title: 'How to Use the Federal Litigation Corpus',
  summary: "What's in the litigation corpus, the coverage window, and what it's good for.",
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 9,
  content: `
**What's in it.** Federal district-court and appellate dockets, searched
live on CourtListener's RECAP archive at any filing date: the case metadata
(court, judge, dates, cause / nature-of-suit), the docket entries, and the
text of attached filings where RECAP has them. RECAP holds only what
someone has bought from PACER, so coverage is uneven by court and by case.
An empty result means CourtListener holds nothing that matches, not that
nothing was filed. RAGtime is not a substitute for PACER for complete,
up-to-the-minute docket tracking.

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

- Full-text search runs over docket entries and the text of the filings
  RECAP holds. Results come newest first, 100 at a time.
- Searching with no court selected returns nothing; "All courts" is the
  default for a reason.
`.trim(),
}
