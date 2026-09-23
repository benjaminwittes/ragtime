import type { DocsEntry } from '../types'

/** USC per-section Summarize. */
export const uscSectionSummaryEntry: DocsEntry = {
  slug: 'usc-section-summary',
  title: 'Summarize This Section',
  summary: 'Plain-English structured summary of one USC section.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 20,
  content: `
Summarize, on a section's detail panel, returns the operative rule in plain
English, who and what it applies to, the defined terms it uses including ones
incorporated by reference, and the cross-references its own text cites —
inline only, never related-but-unmentioned sections. It closes with currency
notes: the release-point caveat, the non-positive-law caveat where it applies
(Title 26, Title 50), and a repealed flag where it applies. One model call,
cheaper than the AMA mode.

**Limits.** Repealed and omitted sections are kept with a status flag rather
than filtered out, and a summary of one leads with that status. A section
past the worker's text cap is truncated, with a notice — rare here.
`.trim(),
}
