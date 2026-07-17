import type { DocsEntry } from '../types'

/**
 * Commentary spoke "How to use" entry — what the corpus contains (two
 * federated publications: Lawfare + Executive Functions), the commentary-not-
 * primary-source caveat, and how to search it.
 */
export const aboutCommentaryEntry: DocsEntry = {
  slug: 'about-commentary',
  title: 'How to Use: Commentary',
  summary:
    'What the Commentary corpus contains (Lawfare + Executive Functions), the commentary-not-primary-source caveat, and how to search it.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 9,
  content: `
**What's in it.** Expert legal and national-security commentary from **two
publications**, federated under one spoke:

- **Lawfare** — its own articles, podcast episodes, and newsletters from
  lawfaremedia.org (2010→present, ~22.7K original pieces).
- **Executive Functions** — the Bob Bauer + Jack Goldsmith publication on the
  presidency and executive power (December 2024→present, a young ~540-piece
  corpus).

This is the platform's **commentary** corpus. Unlike the litigation docket, OLC
opinions, the U.S. Code, the CFR, or FRUS — all primary sources — these archives
are *analysis*: arguments, explainers, and debate by named expert authors.

**The key caveat: commentary, not adjudication.** Every piece reflects its
author's views. The corpus is a record of what these authors have argued, not a
settled account of what the law *is*. When you ask the AI what has been said
about a topic, it reports — with per-author, per-piece, and per-**publication**
attribution — what specific authors wrote, and it never tells you which view is
right.

**A few data notes:**

- **Publication and Author are first-class filters.** Scope to Lawfare or
  Executive Functions, and to a specific author by name (the same author often
  writes in both venues — Jack Goldsmith is the canonical case).
- **Content type.** Filter to articles, essays, podcasts, newsletters, or
  roundups.
- **Coverage is uneven.** Lawfare runs 2010→present; Executive Functions only
  from December 2024. Absence of Executive Functions coverage before then means
  the publication did not yet exist.

**What it's good for.** "What has been written about [Section 702 / emergency
powers / executive privilege]?" — where AI narrative synthesis (the paradigmatic
mode here) gathers the relevant pieces across both publications and lays out the
arguments with attribution. It pairs naturally with the primary-source corpora:
read the opinion in OLC, then see how commentators analyzed it.

**Demo queries:** "What has been argued about the major questions doctrine?";
filter by publication or author to read one venue or contributor; summarize a
specific piece.
`.trim(),
}
