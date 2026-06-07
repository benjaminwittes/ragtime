import type { DocsEntry } from '../types'

/**
 * Docs entry for the Lawfare spoke's claude_ama (narrative synthesis) mode.
 *
 * Lawfare is the platform's first commentary corpus, so the editorial
 * conventions here are distinct: the synthesis is attribution-forward and
 * never adjudicates which view is right — it reports what Lawfare authors
 * have argued, piece by piece.
 */
export const lawfareNarrativeSynthesisEntry: DocsEntry = {
  slug: 'lawfare-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary:
    "Ask what Lawfare has written or argued about a topic; get a synthesized, attribution-forward narrative across pieces.",
  scope: { kind: 'spoke', spokeSlug: 'lawfare' },
  order: 10,
  content: `
**What it is.** Lawfare's flagship AI surface. Type a question; the system
plans a small set of queries against the Lawfare archive, runs them, and writes
a narrative answer with inline citations to specific pieces.

**Good questions to ask.**

- "What has Lawfare written about [Section 702 / the major questions doctrine /
  birthright citizenship]?"
- "How have Lawfare authors argued about [a specific case or controversy]?"
- "What's the range of views on [X] across Lawfare's coverage?"
- "What has [author] argued about [topic]?" — author is a first-class facet.

**The defining convention: attribution, not adjudication.** Lawfare is
commentary. The synthesis tells you *what specific authors argued in specific
pieces* — "In [piece], [author] contends that…; [other author] takes the
opposing view in [piece]…" — and it never resolves the disagreement or tells
you which view is correct. Where contributors disagree, the synthesis surfaces
the disagreement rather than papering over it. Every claim is cited to the
piece it came from.

**The result.** A markdown narrative + a list of cited pieces. Each citation
links out to the canonical lawfaremedia.org URL and opens the piece in the
reader. The "Plan" disclosure at the top shows the exact queries the agent ran
— auditable methodology.

**Cost.** The planning step is one model call (small); the synthesis step is
another (proportional to how many pieces the plan pulled). The pre-flight modal
shows the estimate before every query so you can refine the question before
spending; you can opt out via its "don't show again" checkbox (and re-enable it
under AI access → Preferences).

**Pairs with the primary-source corpora.** Use Lawfare to find the *analysis*
of something you've located in the litigation docket, an OLC opinion, or a
statute — then read the underlying primary source directly in its own spoke.
`.trim(),
}
