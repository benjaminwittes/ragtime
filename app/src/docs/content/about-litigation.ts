import type { DocsEntry } from '../types'

/**
 * Litigation spoke "How to use" entry.
 *
 * The coverage floor is unsettled, not stale: the corpus is mid-switch to a
 * new ingest (Thomas, 2026-09-18), so no date is safe to assert and this
 * entry quotes none. Do not "fix" that from `getHoldings`, which still
 * reports the old floor — settle the corpus first.
 */
export const aboutLitigationEntry: DocsEntry = {
  slug: 'about-litigation',
  title: 'How to Use the Federal Litigation Corpus',
  summary: "What's in the litigation corpus, the coverage window, and what it's good for.",
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 9,
  content: `
**What's in it.** Federal district-court and appellate dockets — case
metadata (parties, court, judge, dates, cause / nature-of-suit), the docket
entries themselves, and OCR text of attached filings where we have it. The
set is deliberately over-inclusive, so it is a strong net for "show me
everything in this space" and a good base for datasets built on definable
criteria.

**Where the corpus starts is not one date.** The comprehensive floor is
moving backward, and this page deliberately quotes no date for it: the figure
would be wrong again before you read it. That floor is an artifact of what
Lawfare first built the corpus for — identifying violated court orders in
immigration habeas cases during the second Trump administration. Curated
**collections** reach further back: January 6 prosecutions to 2021, AI
liability, and others. So "how far back does this go" has two answers, and
the **Collection** filter is where the second one lives.

The corpus updates continuously but can run a few days behind any given
docket, so it is not a substitute for PACER or CourtListener.

**Demo queries to try:**

- Filter to a court and a date range, then open and read the docket of a
  specific case.
- Full-text search "preliminary injunction" or "temporary restraining
  order" across all district courts.
- Narrow to a field, then use Analyze to characterize patterns across the
  set.

**Two limits on search today.** Full-text search runs over docket-entry
descriptions, not the full text of attached documents, so a phrase buried
inside a filed PDF is not findable here yet even though the PDF is. And the
court selector opens with every court checked and sends exactly what is
checked — unchecking them all asks for cases in no court, which is an empty
search rather than a narrow one.
`.trim(),
}
