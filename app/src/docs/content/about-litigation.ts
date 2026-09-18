import type { DocsEntry } from '../types'

/**
 * Litigation spoke "How to use" entry — what's in the corpus, the coverage
 * floor and why it's there, what it's good for, demo queries, and two things
 * to know about search today.
 *
 * The floor is unsettled, not merely stale: coverage is mid-switch to a new
 * ingest (Thomas, 2026-09-18), so no date here is safe to assert and this
 * entry quotes none. Do not "fix" it by copying a number back in from
 * `getHoldings` or from the JSDoc below — settle the corpus first.
 *
 * The floor moved. `spokes/litigation/index.ts` blanked its own
 * `plainEnglishDisclosure` with the note that "filed since 2025-01-20" is
 * stale — comprehensive coverage reaches back to Q4 2024 and curated
 * collections (January 6 to 2021, AI liability) go earlier still. That
 * comment is the newest word on it and what the prose below follows. Note
 * that the same file's `getHoldings` still reports the old floor in its
 * `coverage` string and `knownGaps`; that disagreement is the spoke's to
 * settle, not this entry's to repeat.
 */
export const aboutLitigationEntry: DocsEntry = {
  slug: 'about-litigation',
  title: 'How to Use the Federal Litigation Corpus',
  summary: "What's in the litigation corpus, the coverage window, and what it's good for.",
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 9,
  content: `
**What's in it.** Federal district-court and appellate dockets — the case
metadata (parties, court, judge, dates, cause / nature-of-suit) plus the
docket entries themselves, and OCR text of attached filings where we have
it.

**Where the corpus starts, and why it is not one date.** The comprehensive
floor is moving backward, and this page deliberately does not quote a date
for it: the figure would be wrong again before you read it. That floor is an
artifact of the use case Lawfare first built this corpus for — identifying
violated court orders in immigration habeas cases during the second Trump
administration. Curated
**collections** reach further back than the floor does: January 6
prosecutions to 2021, AI liability, and others. So "how far back does this
go" has two answers, and the **Collection** filter is where the second one
lives. The header band shows the last-synced date and the live counts.

The corpus updates continuously but can be a few days behind the current
state of any given docket — so don't assume the listings include today's
filings. RAGtime is not a substitute for PACER or CourtListener for
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

- Full-text search runs over docket-entry descriptions, not the full text
  of every attached document. Full-document search lands when the ingest
  backfill populates the document text and it is indexed; until then, a
  phrase buried inside a filed PDF is not findable here even though the PDF
  is.
- The court selector opens with every court checked, and the form sends
  exactly what is checked. Uncheck them all and you have asked for cases in
  no court — which is not a narrower search but an empty one. Narrow the
  list rather than clearing it.
`.trim(),
}
