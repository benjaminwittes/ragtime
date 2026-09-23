import type { DocsEntry } from '../types'

/** Presidential Documents per-document Summarize. */
export const presidentialDocumentSummaryEntry: DocsEntry = {
  slug: 'presidential-document-summary',
  title: 'AI Summary: One Document',
  summary: 'What one document orders, the authority it invokes, and its lineage status.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 20,
  content: `
Summarize, on a document's detail view, returns what the document orders, the
constitutional and statutory authority it invokes, which agencies it tasks
and to do what, its effect on prior instruments, and its own status — phrased
as "no recorded revocation", never as "confirmed active". It says so when the
document conspicuously fails to define a key term. The disposition data
beside it is the Office of the Federal Register's own cross-reference record,
parsed rather than inferred.

**Limits.** Finding-aid entries — executive orders from 1940 to 1947, whose
text is not in the corpus — cannot be summarized; the Federal Register link
holds the original. The cost appears in your balance afterward.
`.trim(),
}
