import type { DocsEntry } from '../types'

/**
 * Docs entry for the CFR spoke's claude_ama (regulatory-analysis) mode.
 *
 * Brief #4 §3 names three co-equal flagships (Compliance A / Authority B /
 * Framework C synthesis) plus read-a-section + analytical-with-method,
 * routed via one mode whose planner picks output_mode per question shape.
 */
export const cfrAiSynthesisEntry: DocsEntry = {
  slug: 'cfr-ai-synthesis',
  title: 'Regulatory-Analysis Synthesis (AMA Mode)',
  summary: 'Ask CFR-shaped questions; get a cited analysis across the relevant regulations.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 10,
  content: `
**What it is.** CFR's AI surface. Type a question; the planner recognizes
the shape (compliance / authority / framework / retrieval / analytical) and
writes SQL against the codified regulations. Synthesis returns a
regulatory analysis with inline citations to specific sections.

**The flagships (recognized internally, no buttons).**

- *"What regs apply to [actor] doing [activity]?"* — **Compliance
  synthesis**. The synthesis leads with an explicit ASSUMPTIONS block
  (what actor / activity were modeled), then a ranked list of applicable
  parts + the synthesized restriction summary. Practical-compliance
  framing absent in USC.
- *"What does agency X have authority to regulate?"* — **Authority
  synthesis**. Pulls issued regs grouped by part. *v1 limitation:* the
  cross-corpus pieces (USC statutory authority, OLC executive
  interpretation, litigation challenges) are deferred — the synthesis
  surfaces this as a candor note. The answer is the regulatory-text
  piece only; to know whether the agency *has* the authority it claims,
  the statutory and litigation pieces matter.
- *"Describe the regulatory framework for [X]"* — **Framework synthesis**.
  Often scope-routed by title, agency (via title+chapter), or part
  (HIPAA = 45 CFR Parts 160 & 164; Reg Z = 12 CFR Part 1026).
- *"What does 45 CFR § 164.502 say?"* — **read-a-section** (citation
  lookup that synthesizes the section).
- *"Is there a regulation forbidding X"* / *"Show me regs about X"* —
  **retrieval/coverage**.
- *"How many CFR sections were amended in the last 30 days?"* —
  **analytical**, with the denominator and matching pattern surfaced in
  the answer itself.

**Editorial conventions.**

- *Per-section currency.* CFR currency is per-section, not monolithic
  (every section has its own \`up_to_date_as_of\`). The synthesis
  surfaces the relevant section's currency date when it turns on
  specific text.
- *Agency routing.* The planner derives agency from (title, chapter) —
  e.g. FDA = title 21 mostly, EPA = title 40, Federal Reserve = title 12
  chapter II. No separate agency column.
- *Reserved sections.* Placeholder sections (\`reserved = true\`) are
  excluded by default; the user has to ask explicitly to include them.
- *USC ↔ CFR implements queries.* "What regulations implement [USC
  citation]" works via FTS-on-citation-text as a proxy in v1. The
  structured eCFR-authorities join is deferred to a follow-up; the
  synthesis flags the approximation.
- *Definitional questions.* "How do federal regs define X?" works via
  FTS for v1; the parsed \`cfr_definitions\` table (with \`scope_note\`)
  is deferred. The synthesis flags that the same term may be defined
  differently across subparts.
- *No editorializing.* CFR sections are binding text — the synthesis
  describes what they say, not whether the regulation is well-designed.

**Cost.** Plan call + synthesis call. The pre-flight modal shows the
estimate before every query (opt out via its "don't show again" checkbox).
`.trim(),
}
