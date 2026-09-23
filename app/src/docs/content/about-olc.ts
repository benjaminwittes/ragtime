import type { DocsEntry } from '../types'

/**
 * OLC spoke "How to use" entry. The count is 2,151 = 1,445 DOJ-published +
 * 706 Knight FOIA, read off the worker. Do not re-derive it.
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
binding within the executive. DOJ's published archive (1,445) plus opinions
the Knight First Amendment Institute obtained in FOIA litigation (706), so
2,151 in all, reaching back to the 1930s.

**Released, not issued.** Counts and date distributions reflect when opinions
were released, not when they were written, and many OLC opinions are never
published at all. This is a large slice of OLC's output, not the complete
record.

**Three data notes.** Provenance (DOJ-published vs. Knight FOIA) is tracked
and shown, and the FOIA releases are often the more sensitive opinions. A
subset of the Knight scans are degraded OCR, flagged rather than hidden. And
author, recipient and requesting-agency metadata is sparse in the source, so
don't rely on it as a filter axis yet.

**What it's good for.** Doctrinal questions: what OLC has said about recess
appointments, war powers, executive privilege. Keyword search underperforms
on abstract doctrinal phrasing, so use the free Semantic setting in **Search
by**, and AI synthesis when you want the opinions read and tied together
rather than merely found.

**Demo queries:** "OLC on the President's removal power"; filter by date
range to see a decade's released opinions; summarize a specific opinion.
`.trim(),
}
