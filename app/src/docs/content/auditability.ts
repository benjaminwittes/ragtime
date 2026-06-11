import type { DocsEntry } from '../types'

/**
 * Global "Auditability" entry — the principle that governs everything:
 * no naked claims, no naked numbers, every output checkable against the
 * sources it came from, and over-inclusion as a deliberate design choice.
 */
export const auditabilityEntry: DocsEntry = {
  slug: 'auditability',
  title: 'Auditability: How to Trust What You See',
  summary: 'No naked claims, no naked numbers. Every answer is checkable against the sources it came from.',
  scope: { kind: 'global' },
  order: 5,
  content: `
Auditability is the principle that governs everything here. AIs make
mistakes, and RAGtime puts AI on legal and historical material. The way it
earns the right to do that is by making every output checkable.

What's more, AI mistakes are designed into the system. When RAGtime
produces a dataset of cases or statutes to review, it is intended to be
over-inclusive — to include any results that might contain what you're
looking for and, sometimes, to rank results by their probable value. It is
never meant to replace human review, but to feed it with as many sharp
objects as it can find in a given set of haystacks, so that humans can
identify which are needles. What does that mean in practice?

- **No naked assertions.** Every claim an AI answer makes is tied to a
  specific cited source you can open and read.
- **No naked numbers.** Every count comes with the dataset it was computed
  from — if the tool says "37 cases," you can see the 37 cases.
- **Every result is a source.** Search and filter results aren't
  summaries; they're the actual documents, with precise click-through to
  the provision, section, opinion, or docket entry. Ask for a summary and
  you get the summary plus the underlying documents being summarized.
- **Methodology travels with the answer.** When the AI writes SQL or
  chooses a retrieval strategy, that's shown too, so you can audit the
  method, not just the output.
- **Inference is labeled** as inference, and distinguished from sourced
  fact.
- **Dual output.** Analytical answers always ship with the responsive
  dataset behind them — a report and the documents it rests on. That
  pairing is the auditability principle in its most concrete form.

**Why this matters for AI error.** Every output is verifiable against
primary sources, so any model mistake is bounded. This approach is designed
to mitigate the risk of model hallucination — but it comes with a use
principle for the humans using RAGtime: please do not take RAGtime's AI
output as authoritative without human review of the documents that underlie
it. It is not designed to produce authoritative answers on its own. It is
designed to arm humans with the documents they need to reach their own, and
to make those documents maximally useful.
`.trim(),
}
