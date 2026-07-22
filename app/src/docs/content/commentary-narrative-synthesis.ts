import type { DocsEntry } from '../types'

/**
 * Docs entry for the Commentary spoke's claude_ama (narrative synthesis) mode.
 *
 * Commentary federates two publications, so the editorial conventions are
 * distinct: the synthesis is attribution-forward, names the publication on every
 * citation, and never adjudicates which view is right.
 */
export const commentaryNarrativeSynthesisEntry: DocsEntry = {
  slug: 'commentary-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary:
    'Ask what has been written or argued about a topic; get a synthesized, attribution-forward narrative across Lawfare and Executive Functions.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 10,
  content: `
**What it is.** Commentary's flagship AI surface. Type a question; the system
plans a small set of queries across **both** publications (Lawfare and Executive
Functions), runs them, and writes a narrative answer citing specific pieces.

**Good questions to ask.**

- "What has been written about [Section 702 / the major questions doctrine /
  presidential immunity]?"
- "How have commentators argued about [a specific case or controversy]?"
- "What has [author] argued about [topic]?" — the same author often writes in
  both publications, and the synthesis covers both.
- "What's the range of views on [X]?"

**The defining convention: attribution, not adjudication.** This is commentary.
The synthesis tells you *what specific authors argued in specific pieces, in
which publication* — "In [piece] (Executive Functions), [author] contends…;
[other author] takes the opposing view in [piece] (Lawfare)…" — and it never
resolves the disagreement or tells you which view is correct. Every claim is
cited to the piece and publication it came from.

**The result.** A markdown narrative + a list of cited pieces. Each citation
links out to the publisher's own site and opens the piece in the reader. The
"Plan" disclosure shows the exact queries the agent ran — auditable methodology.

**Coverage candor.** Because Executive Functions only launched December 2024, the
synthesis states each publication's span on trend and "has anyone written about"
questions, so its silence on earlier events isn't mistaken for a considered view.

**Cost.** The planning step is one model call (small); the synthesis step is
another (proportional to how many pieces the plan pulled). The pre-flight modal
shows the estimate before every query.
`.trim(),
}
