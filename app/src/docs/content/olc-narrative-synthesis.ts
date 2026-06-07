import type { DocsEntry } from '../types'

/**
 * Docs entry for the OLC spoke's claude_ama (narrative synthesis) mode.
 *
 * Brief #2 §3 names narrative synthesis as OLC's flagship paid surface.
 * This entry explains what it does, when to use it, and the editorial
 * conventions specific to OLC content (attribution-forward voice,
 * released-vs-issued caveat, DOJ-vs-Knight-FOIA provenance).
 */
export const olcNarrativeSynthesisEntry: DocsEntry = {
  slug: 'olc-narrative-synthesis',
  title: 'Narrative Synthesis (AMA Mode)',
  summary: 'Ask OLC-shaped questions and get a synthesized narrative across opinions.',
  scope: { kind: 'spoke', spokeSlug: 'olc' },
  order: 10,
  content: `
**What it is.** OLC's flagship AI surface. Type a question; the system plans
a small set of SQL queries against the OLC corpus, runs them, and writes a
narrative answer with inline citations to specific opinions.

**Good questions to ask.**

- "How has OLC's view of [executive privilege / the Appointments Clause /
  the recess-appointment power] evolved?"
- "Can the Department of [X] do [Y]?" — the most authentic OLC framing;
  this is literally how agencies submit questions to OLC.
- "When has OLC told the executive branch it could *not* do something?"
- "Is [X] constitutional, according to OLC?"

**Less-good questions.**

- Anything that needs an administration filter today. Author, recipient, and
  president-administration aren't yet populated on the metadata. The AI is
  told not to filter on them; it'll surface a candor note if your question
  needed them.

**The result.** A markdown narrative + a list of cited opinion ids. Each
citation opens the full opinion in a side sheet. The "Plan" disclosure at
the top shows the exact SQL queries the agent ran — auditable methodology
per brief #2.

**Cost.** The planning step is one model call (small); the synthesis step
is another (proportional to how many opinions the plan pulled). The
pre-flight modal shows the estimate before every query so you can refine
the question before spending; you can opt out via its "don't show again"
checkbox (and re-enable it under AI access → Preferences).

**Editorial conventions.** The synthesis is attribution-forward: OLC
opinions are the executive branch's *position*, not a court's holding.
Every claim is cited; nothing is editorialized. Two cross-cutting caveats
the agent surfaces automatically:

- *Released, not issued.* Counts by year reflect *released* opinions, not
  OLC's true output (most opinions are never released).
- *DOJ-published vs. Knight FOIA.* The corpus includes 706 opinions DOJ
  never published that were obtained via Knight First Amendment Institute
  FOIA work — the synthesis flags this when it's load-bearing.
`.trim(),
}
