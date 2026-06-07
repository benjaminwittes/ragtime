import type { DocsEntry } from '../types'

/**
 * Lawfare spoke "How to use" entry — what the corpus contains (Lawfare's own
 * articles, podcasts, and newsletters), the commentary-not-primary-source
 * caveat, the suppressed-roundups note, and how to search it.
 */
export const aboutLawfareEntry: DocsEntry = {
  slug: 'about-lawfare',
  title: 'How to Use: Lawfare',
  summary:
    "What the Lawfare corpus contains, the commentary-not-primary-source caveat, and how to search it.",
  scope: { kind: 'spoke', spokeSlug: 'lawfare' },
  order: 9,
  content: `
**What's in it.** Lawfare's own published analysis — the articles, podcast
episodes, and newsletters published at lawfaremedia.org. This is the
platform's first **commentary** corpus. Unlike the litigation docket, OLC
opinions, the U.S. Code, the CFR, or FRUS — all primary sources — Lawfare's
archive is *analysis*: arguments, explainers, and debate by Lawfare's
contributors.

**The key caveat: commentary, not adjudication.** Every piece reflects its
author's views. The corpus is a record of what Lawfare authors have argued,
not a settled account of what the law *is*. When you ask the AI what Lawfare
has said about a topic, it reports — with per-author, per-piece attribution —
what specific authors wrote, and it never tells you which view is right.

**A few data notes:**

- **Author and Topic are first-class filters.** You can scope to a specific
  contributor or one of Lawfare's controlled topics directly — these are not
  free-text guesses but structured facets.
- **Content type.** Filter to articles, podcast episodes, or newsletters.
- **Roundups & announcements are hidden by default.** Link round-ups and
  housekeeping posts are suppressed unless you toggle "Include roundups &
  announcements" — most research wants the substantive pieces only.

**What it's good for.** "What has Lawfare written about [Section 702 /
emergency powers / a specific case]?" — where AI narrative synthesis (the
paradigmatic mode here) gathers the relevant pieces and lays out the arguments
with attribution. It pairs naturally with the primary-source corpora: read the
opinion in OLC, then see how Lawfare's contributors analyzed it.

**Demo queries:** "What has Lawfare argued about the major questions
doctrine?"; filter by author to read one contributor's body of work; summarize
a specific piece.
`.trim(),
}
