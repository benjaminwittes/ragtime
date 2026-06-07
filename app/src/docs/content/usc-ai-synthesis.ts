import type { DocsEntry } from '../types'

/**
 * Docs entry for the USC spoke's claude_ama (legal-analysis synthesis) mode.
 *
 * Brief #3 §3 names three co-equal flagships (Legality A / Authority B /
 * Topical C synthesis) plus read-a-section + analytical-with-method, all
 * routed via one mode whose planner picks output_mode per question shape.
 */
export const uscAiSynthesisEntry: DocsEntry = {
  slug: 'usc-ai-synthesis',
  title: 'Legal-Analysis Synthesis (AMA Mode)',
  summary: 'Ask USC-shaped legal questions; get a cited analysis across the relevant sections.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 10,
  content: `
**What it is.** USC's AI surface. Type a question; the planner recognizes
the shape (legality / authority / topical / retrieval / analytical) and
writes SQL against the codified statutes. Synthesis returns a legal
analysis with inline citations to specific sections.

**The flagships (recognized internally, no buttons).**

- *"Is it lawful for [X] to do [Y]?"* — **Legality synthesis**. Pulls the
  cluster of sections that bear on the question; attribution-forward
  analysis.
- *"Can the President / [agency] do [X]?"* — **Authority synthesis**. Pulls
  the statutory authorities from USC. *v1 limitation:* this is the
  statutory piece only — the system surfaces a candor note that the
  implementing regulations (CFR), executive interpretation (OLC), and
  challenges (litigation) aren't yet cross-referenced. Cross-corpus joins
  land in a follow-up.
- *"Summarize federal law on [domain]"* — **Topical synthesis**. Scopes by
  title (tax → Title 26, criminal → Title 18, UCMJ → Title 10 ch. 47).
- *"What does 8 U.S.C. § 1225 say?"* — **read-a-section** (a citation
  lookup that synthesizes the section).
- *"Is there any law forbidding [X]?"* / *"Show me laws that involve [X]"*
  — **retrieval/coverage**.
- *"How many federal laws contain criminal penalties?"* — **analytical**.
  The denominator and matching pattern are surfaced in the answer.

**Editorial conventions.**

- *Release-point currency.* Every analysis carries the "as of release
  119-93; changes since not reflected" caveat.
- *Positive law.* Non-positive-law titles (Title 26 / Internal Revenue
  Code, Title 50 / War and National Defense) are organized restatements
  of the underlying Statutes at Large. When the analysis leans on a
  non-positive-title section, the synthesis surfaces that — the binding
  text is the Statutes at Large in those cases.
- *Constitution gap.* When the answer turns substantially on Article II
  or the Bill of Rights, the synthesis says so transparently rather than
  silently answering as if the constitutional dimension doesn't exist.
  Constitution-as-corpus is post-launch acquisition.
- *No editorializing.* USC sections are binding text — the synthesis
  describes what they say, not whether the policy is right.

**Cost.** Plan call + synthesis call. The pre-flight modal shows the
estimate before every query; refine the question if the scope is larger
than you intended, or opt out via its "don't show again" checkbox.

**Phase 2: semantic retrieval.** USC questions about *principles*
(\`due process\`, \`commerce clause concepts\`) underperform on keyword
search. The pgvector upgrade is on the post-beta roadmap and matters
most acutely on USC and OLC.
`.trim(),
}
