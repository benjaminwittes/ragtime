import type { DocsEntry } from '../types'

/** OLC claude_ama (narrative synthesis) mode. */
export const olcNarrativeSynthesisEntry: DocsEntry = {
  slug: 'olc-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'Ask OLC-shaped questions and get a synthesized narrative across opinions.',
  scope: { kind: 'spoke', spokeSlug: 'olc' },
  order: 10,
  content: `
**What it is.** Type a question; the system plans a small set of SQL queries
against the OLC corpus, runs them, and writes a narrative answer with inline
citations to specific opinions. The Plan disclosure shows the SQL it ran.

**Good questions to ask.**

- "How has OLC's view of [executive privilege / the Appointments Clause /
  the recess-appointment power] evolved?"
- "Can the Department of [X] do [Y]?" — the most authentic OLC framing;
  this is literally how agencies submit questions to OLC.
- "When has OLC told the executive branch it could *not* do something?"
- "Is [X] constitutional, according to OLC?"

**Less-good questions.** Anything needing an administration filter. Author,
recipient and president-administration are not populated, the agent is told
not to filter on them, and it raises a candor note when your question needed
them.

**Editorial conventions.** OLC opinions are the executive branch's
*position*, not a court's holding, so the synthesis attributes rather than
asserts. Two caveats ride along: counts by year are *released* opinions, not
OLC's true output, and 706 of these are opinions DOJ never published,
obtained through Knight First Amendment Institute FOIA work.

**Cost.** One small planning call, plus a synthesis call proportional to how
many opinions the plan pulled.
`.trim(),
}
