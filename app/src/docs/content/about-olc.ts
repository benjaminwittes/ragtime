import type { DocsEntry } from '../types'

/**
 * OLC spoke "How to use" entry — what the corpus contains (DOJ-published +
 * Knight FOIA), the released-vs-issued caveat, the data notes (provenance,
 * degraded scans, sparse metadata), and how to search it.
 */
export const aboutOlcEntry: DocsEntry = {
  slug: 'about-olc',
  title: 'How to Use: OLC Opinions',
  summary: 'What the OLC corpus contains, the released-vs-issued caveat, and how to search it.',
  scope: { kind: 'spoke', spokeSlug: 'olc' },
  order: 9,
  content: `
**What's in it.** Opinions of the Justice Department's Office of Legal
Counsel — the executive branch's own authoritative legal interpretations,
binding within the executive. The corpus combines DOJ's published archive
(1,439 opinions) with opinions obtained by the Knight First Amendment
Institute in Freedom of Information Act litigation (706 opinions) — 2,145
in total, reaching back to the 1930s.

**A key caveat.** Counts and date distributions reflect when opinions were
released or published, not necessarily when they were written. Many OLC
opinions are never published at all. So this corpus is a large and valuable
slice of OLC's output, but it is not the complete record by any means — and
any year-over-year count should be read as "released," not "issued."

**A few data notes:**

- The provenance of each opinion (DOJ-published vs. Knight-FOIA) is tracked
  and shown. This matters because the FOIA releases, as opposed to
  publications, are often the more sensitive opinions.
- Some FOIA scans are degraded. A subset of the Knight documents are
  lower-quality OCR; where the text is rough, that's flagged rather than
  hidden.
- Author / recipient / requesting-agency metadata is sparse (frequently
  absent in the source), so don't rely on it as a filter axis yet.

**What it's good for.** Doctrinal questions — "what has OLC said about
recess appointments / war powers / executive privilege" — where AI
narrative synthesis (the paradigmatic mode here) shines. Keyword search
underperforms on abstract doctrinal phrasing, so lean on AI synthesis to
find documents by concept.

**Demo queries:** "OLC on the President's removal power"; filter by date
range to see a decade's released opinions; summarize a specific opinion.
`.trim(),
}
