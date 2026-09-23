import type { DocsEntry } from '../types'

/** CFR per-section Summarize. */
export const cfrSectionSummaryEntry: DocsEntry = {
  slug: 'cfr-section-summary',
  title: 'Summarize This Section',
  summary: 'Plain-English structured summary of one CFR section.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 20,
  content: `
Summarize, on a section's detail panel, returns the operative rule in plain
English, which regulated party and activity it applies to — often as
load-bearing as the rule itself — the defined terms it uses including ones
incorporated by reference, and the cross-references its own text cites,
inline only. It closes with two dates: the section's \`up_to_date_as_of\` and
its \`latest_amended_on\`. One model call, cheaper than the AMA mode.

**Limits.** Reserved sections are placeholders with no operative text, and
the button is disabled for those. A section past the worker's text cap is
truncated, with a notice — more common here than in USC, since a HIPAA
Security Rule section can run past it.
`.trim(),
}
