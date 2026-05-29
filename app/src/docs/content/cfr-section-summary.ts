import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this section" action on the CFR section
 * detail sheet. Brief #4 §3 read-a-section — an action on the canonical
 * section view, not a mode in the selector.
 */
export const cfrSectionSummaryEntry: DocsEntry = {
  slug: 'cfr-section-summary',
  title: 'Summarize this section',
  summary: 'Plain-English structured summary of one CFR section.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 20,
  content: `
**What it is.** A button on the section detail side sheet. Click to
generate a structured plain-English summary of the regulation using your
configured AI access.

**The output.** A markdown summary organized around regulatory-research
conventions:

- *What it does* — the operative rule, 1–3 sentences.
- *To whom it applies* — the regulated party / actor / activity scope.
  Often as load-bearing as the operative rule itself.
- *Key terms* — defined terms or terms-of-art the section uses, including
  definitions incorporated by reference ("as defined in §164.103").
- *Cross-references* — sections, statutory authorities, and CFR
  provisions the text explicitly cites. Inline-only; the summary does
  *not* import related-but-unmentioned regulations.
- *Currency* — surfaces both the section's \`up_to_date_as_of\` (per-
  section currency) and \`latest_amended_on\` (when the section was last
  amended). Researchers need to know how fresh this text is.

**Long sections.** Sections longer than the worker's text cap are
truncated before the model sees them; the result panel surfaces a clear
"truncated" notice (more common in CFR than USC — complex regulations
like HIPAA Security Rule sections can exceed the cap).

**Reserved sections.** Placeholders with no operative text. The button
is disabled for those; there's nothing to summarize.

**Cost.** One model call per summarize. Cheaper than the AMA mode
because there's no planning step.
`.trim(),
}
