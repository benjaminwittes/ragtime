import type { DocsEntry } from '../types'

/** Global "Auditability" entry — every output checkable against its sources. */
export const auditabilityEntry: DocsEntry = {
  slug: 'auditability',
  title: 'Auditability: How to Trust What You See',
  summary: 'No naked claims, no naked numbers. Every answer is checkable against the sources it came from.',
  scope: { kind: 'global' },
  order: 5,
  content: `
AIs make mistakes, and RAGtime puts AI on legal and historical material. It
earns the right to do that by making every output checkable.

- **No naked assertions.** Every claim in an AI answer is tied to a cited
  source you can open and read.
- **No naked numbers.** Every count comes with the dataset behind it. "37
  cases" means you can see the 37 cases.
- **Every result is a source.** Search and filter results are the documents
  themselves, with click-through to the provision, section, opinion or docket
  entry. Ask for a summary and you get the summary plus what it summarized.
- **Methodology travels with the answer.** When the AI writes SQL or picks a
  retrieval strategy, that is shown too.
- **Inference is labeled** as inference, kept apart from sourced fact.

Datasets here are deliberately over-inclusive: better to return anything that
might hold what you are looking for, ranked by probable value, and let you
read. Model error is bounded, not eliminated. Do not treat AI output here as
authoritative without reading the documents under it.
`.trim(),
}
