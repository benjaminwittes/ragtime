import type { DocsEntry } from '../types'

/**
 * USC spoke "How to use" entry — the full codified federal statutes:
 * coverage, release-point currency, the positive-law-vs-not distinction
 * and why it matters, what's not here (cross-corpus caveat), and demos.
 */
export const aboutUscEntry: DocsEntry = {
  slug: 'about-usc',
  title: 'How to Use: U.S. Code',
  summary: 'The full codified federal statutes — coverage, positive-law status, and currency.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 9,
  content: `
**What's in it.** The entire United States Code — all 53 titles, all 60,416
sections — the codification of general and permanent federal statutory law.

**Currency.** The corpus reflects a specific release date (shown in the
header). Statutes enacted after that point won't appear yet; a refresh
pipeline to track new release points is planned.

**Positive law vs. not — and why it matters.** Some titles have been
enacted into "positive law" (the Code text *is* the law); others are a
non-binding restatement of the underlying Statutes at Large. That status is
a filter axis and is surfaced on each section, because it changes how
authoritative the codified text is.

**What's not here.** The Code is statutes — not the Constitution, not
regulations (that's the CFR spoke), and not case law (that's the litigation
spoke). When a question needs the implementing regulation or the
enabling-authority chain, that's a cross-corpus move; today those links are
noted as a candor caveat rather than auto-traversed.

**What it's good for.** Locating and interpreting a specific provision, and
asking about legality or legal authority on topical questions. The AI
synthesis can pull the governing sections and explain how they fit a fact
pattern; structured filters (title, section, chapter, heading, positive-law
status) are free.

**Demo queries:** "What authority governs expedited removal?"; "I plan to
use an AR-15 to rob a bank — what statutes, criminal or civil, might
complicate my plans?"; jump to a known citation like 8 U.S.C. § 1225;
filter Title 18 by chapter.
`.trim(),
}
