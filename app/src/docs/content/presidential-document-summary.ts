import type { DocsEntry } from '../types'

/**
 * Presidential Documents per-document Summarize entry — the detail-sheet
 * action and what its summary covers.
 */
export const presidentialDocumentSummaryEntry: DocsEntry = {
  slug: 'presidential-document-summary',
  title: 'AI Summary: One Document',
  summary:
    'The Summarize action on a document detail view — what it does, authority invoked, who it tasks, lineage status.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 20,
  content: `
**What it is.** On any document's detail view, the Summarize button
produces a structured summary: what the document orders, the
constitutional and statutory authority it invokes, which agencies it
tasks and to do what, its effect on prior instruments, and its own status
(what later documents did to it — phrased as "no recorded revocation,"
never "confirmed active").

**Honesty rules.** The summary describes what the document says, period.
If the document conspicuously fails to define a key term, the summary says
so. The disposition data shown alongside comes from the Office of the
Federal Register's own cross-reference record, parsed — not inferred by
the AI.

**Limits.** Finding-aid entries (1940–1947 executive orders, pending
historical text backfill) can't be summarized — there's no text in the
corpus; the button explains this and the Federal Register link holds the
original. Uses your configured AI access; the cost appears in your balance
afterward.
`.trim(),
}
