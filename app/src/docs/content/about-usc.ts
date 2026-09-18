import type { DocsEntry } from '../types'

/** USC spoke "How to use" entry. */
export const aboutUscEntry: DocsEntry = {
  slug: 'about-usc',
  title: 'How to Use: U.S. Code',
  summary: 'The full codified federal statutes — coverage, positive-law status, and currency.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 9,
  content: `
**What's in it.** The entire United States Code — all 53 titles, more than
60,400 sections — the codification of general and permanent federal statutory
law. It reflects one release date, shown in the header; statutes enacted
after it are not here yet.

**Positive law, and why it matters.** Some titles have been enacted into
positive law: the Code text *is* the law. Others are a non-binding
restatement of the underlying Statutes at Large. That status is a filter axis
and is shown on each section, because it changes how authoritative the
codified text is.

**What it cannot answer.** The Code is statutes — not the Constitution, not
regulations (the CFR spoke), not case law (the litigation spoke). Where a
question needs the implementing regulation or the enabling-authority chain,
that link is flagged as a caveat rather than traversed.

**What it's good for.** Locating and interpreting a specific provision, and
asking about legality or legal authority on a topic. Structured filters —
title, section, chapter, heading, positive-law status — are free.

**Demo queries:** "What authority governs expedited removal?"; "I plan to
use an AR-15 to rob a bank — what statutes, criminal or civil, might
complicate my plans?"; jump to a known citation like 8 U.S.C. § 1225;
filter Title 18 by chapter.
`.trim(),
}
