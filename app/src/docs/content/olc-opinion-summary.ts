import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this opinion" action on the OLC opinion
 * detail sheet. Brief #2 §3 names this as the "plus" alongside the
 * narrative-synthesis flagship — not a mode in the selector, but an
 * action on the canonical opinion view.
 */
export const olcOpinionSummaryEntry: DocsEntry = {
  slug: 'olc-opinion-summary',
  title: 'Summarize This Opinion',
  summary: 'Get a structured AI summary of one OLC opinion from its detail panel.',
  scope: { kind: 'spoke', spokeSlug: 'olc' },
  order: 20,
  content: `
**What it is.** A button on the opinion detail side sheet (where you read
the full opinion text). Click it to generate a structured summary of the
opinion using your configured AI access.

**The output.** A markdown summary organized around standard headings:

- *Question presented* — what OLC was asked.
- *Conclusion* — OLC's bottom line.
- *Reasoning* — the steps of the argument, in OLC's framing.
- *Authorities cited* — major statutes, prior OLC opinions, court cases.
- *Notable caveats / limits* — anything OLC explicitly disclaimed.

The summary is attribution-forward: it describes what the opinion *says*,
not whether it's right. Quotations use curly quotes; direct quotation is
sparse.

**Long opinions.** Opinions longer than the worker's text cap are
truncated before the model sees them. The result panel surfaces a clear
"truncated" notice in that case — the later sections of the opinion
weren't summarized.

**Opinions with no text.** Some Knight FOIA entries are catalog records
without recoverable text (DOJ released the index entry but no usable
scan). The button is disabled for those; the corpus knows the opinion
exists but holds nothing to summarize.

**Degraded OCR.** ~199 Knight FOIA opinions are degraded scans. When you
summarize one, the model's candor note will lower-confidence the result
accordingly. The canonical PDF (linked under Provenance) is the source
of truth in those cases.

**Cost.** One model call per summarize. Cheaper than the narrative AMA
because there's no planning step.
`.trim(),
}
