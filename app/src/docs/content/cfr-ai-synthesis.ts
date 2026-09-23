import type { DocsEntry } from '../types'

/** CFR claude_ama (regulatory-analysis) mode. */
export const cfrAiSynthesisEntry: DocsEntry = {
  slug: 'cfr-ai-synthesis',
  title: 'Regulatory-Analysis Synthesis (AMA Mode)',
  summary: 'Ask CFR-shaped questions; get a cited analysis across the relevant regulations.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 10,
  content: `
**What it is.** Type a question; the planner recognizes its shape, writes SQL
against the codified regulations, and returns a regulatory analysis with
inline citations to specific sections.

**The shapes it recognizes.** *"What regs apply to X doing Y?"* leads with an
explicit assumptions block naming the actor and activity it modeled, then a
ranked list of applicable parts. *"What does agency X have authority to
regulate?"* returns issued regulations grouped by part, and only those —
statutory authority (USC), executive interpretation (OLC) and litigation
challenges are not cross-referenced, which matters when the real question is
whether the agency *has* the authority it claims. *"Describe the regulatory
framework for X"* is scope-routed by title, agency or part. *"What does 45
CFR § 164.502 say?"* is a citation lookup, and *"how many sections were
amended in the last 30 days?"* is analytical, with its denominator surfaced.

**Editorial conventions.** Currency is per-section, so the analysis surfaces
the relevant section's own date when it turns on specific text. Agency is
derived from title and chapter; there is no agency column. Reserved sections
are excluded unless you ask for them. "What regulations implement [USC
citation]" and "how do federal regs define X" both run as full-text searches
and the synthesis flags the approximation — the same term may be defined
differently across subparts. CFR sections are binding text, so the synthesis
describes what they say, never whether the regulation is well-designed.
`.trim(),
}
