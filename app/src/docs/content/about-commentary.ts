import type { DocsEntry } from '../types'

/** Commentary spoke "How to use" entry — two federated publications. */
export const aboutCommentaryEntry: DocsEntry = {
  slug: 'about-commentary',
  title: 'How to Use: Commentary',
  summary: 'Lawfare and Executive Functions — analysis by named authors, not primary sources.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 9,
  content: `
**What's in it.** Two publications, federated under one spoke: **Lawfare**
(articles, podcast episodes and newsletters from lawfaremedia.org, 2010 to
the present, about 22.7K original pieces) and **Executive Functions** (Bob
Bauer and Jack Goldsmith on the presidency and executive power, December 2024
to the present, about 540 pieces).

**Commentary, not adjudication.** These archives are *analysis* — arguments,
explainers and debate by named expert authors — not primary sources. The
corpus records what these authors argued, not what the law *is*. Ask the AI
what has been said about a topic and it reports, with per-author, per-piece
and per-**publication** attribution, and never tells you which view is right.

**Three data notes.** Publication and author are first-class filters, which
matters because the same author often writes in both venues. Content type is
built from the types the corpus actually holds and scoped to whichever
publication you picked; there is no topic filter and no roundup toggle, since
neither field is first-class across both. And coverage is uneven: nothing
from Executive Functions predates December 2024, because the publication did
not yet exist.

**What it's good for.** "What has been written about Section 702 / emergency
powers / executive privilege?" It pairs with the primary-source corpora: read
the opinion in OLC, then see how commentators analyzed it.

**Demo queries:** "What has been argued about the major questions doctrine?";
filter by publication or author to read one venue or contributor; summarize a
specific piece.
`.trim(),
}
