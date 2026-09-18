import type { DocsEntry } from '../types'

/** OLC per-opinion Summarize. The 197 degraded scans is a measured figure. */
export const olcOpinionSummaryEntry: DocsEntry = {
  slug: 'olc-opinion-summary',
  title: 'Summarize This Opinion',
  summary: 'Get a structured AI summary of one OLC opinion from its detail panel.',
  scope: { kind: 'spoke', spokeSlug: 'olc' },
  order: 20,
  content: `
Summarize, on an opinion's detail panel, returns the question presented,
OLC's conclusion, the reasoning in OLC's own framing, the authorities cited,
and anything OLC explicitly disclaimed. It describes what the opinion says,
not whether it is right. One model call, cheaper than the narrative AMA.

**What it cannot read.** Some Knight FOIA entries are catalog records with no
recoverable scan, and the button is disabled there. About 197 more are
degraded scans; a summary of one carries a lowered-confidence note, and the
canonical PDF under Provenance is the source of truth. An opinion past the
worker's text cap is truncated, with a notice saying so.
`.trim(),
}
