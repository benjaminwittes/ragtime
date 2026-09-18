import type { DocsEntry } from '../types'

/** Commentary claude_ama mode — two publications, attribution never verdict. */
export const commentaryNarrativeSynthesisEntry: DocsEntry = {
  slug: 'commentary-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'What has been argued about a topic, attributed to author and publication.',
  scope: { kind: 'spoke', spokeSlug: 'commentary' },
  order: 10,
  content: `
**What it is.** Type a question; the system plans a small set of queries
across **both** publications, runs them, and writes a narrative answer citing
specific pieces. Each citation links out to the publisher's own site, and the
Plan disclosure shows the queries it ran.

**Good questions to ask.**

- "What has been written about [Section 702 / the major questions doctrine /
  presidential immunity]?"
- "How have commentators argued about [a specific case or controversy]?"
- "What has [author] argued about [topic]?" — the same author often writes in
  both publications, and the synthesis covers both.
- "What's the range of views on [X]?"

**Attribution, not adjudication.** The synthesis tells you what specific
authors argued in specific pieces, in which publication — "In [piece]
(Executive Functions), [author] contends…; [other author] takes the opposing
view in [piece] (Lawfare)…" — and never resolves the disagreement.

**Coverage candor.** Executive Functions launched in December 2024, so the
synthesis states each publication's span on trend and "has anyone written
about this" questions. Its silence on earlier events is not a considered
view.

**Cost.** One small planning call, plus a synthesis call proportional to how
many pieces the plan pulled.
`.trim(),
}
