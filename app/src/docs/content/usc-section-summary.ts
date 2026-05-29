import type { DocsEntry } from '../types'

/**
 * Docs entry for the "Summarize this section" action on the USC section
 * detail sheet. Brief #3 §3 read-a-section — not a mode in the selector;
 * an action on the canonical section view.
 */
export const uscSectionSummaryEntry: DocsEntry = {
  slug: 'usc-section-summary',
  title: 'Summarize this section',
  summary: 'Plain-English structured summary of one USC section.',
  scope: { kind: 'spoke', spokeSlug: 'usc' },
  order: 20,
  content: `
**What it is.** A button on the section detail side sheet. Click to
generate a structured plain-English summary of the section using your
configured AI access.

**The output.** A markdown summary organized around legal-research
conventions:

- *What it does* — the operative rule, 1–3 sentences.
- *Scope* — who / what / when the section applies to.
- *Key terms* — defined terms or terms-of-art the section uses, including
  definitions incorporated by reference ("as defined in section X").
- *Cross-references* — sections, statutes, and code provisions the text
  explicitly cites. Inline-only; the summary does *not* import
  related-but-unmentioned sections.
- *Notes on currency* — release-point caveat ("as of release 119-93;
  changes since not reflected"); non-positive-law restatement caveat
  when applicable (Title 26, Title 50); repealed-status flag when
  applicable.

**Long sections.** Sections longer than the worker's text cap are
truncated before the model sees them; the result panel surfaces a clear
"truncated" notice when that happens (rare on USC — most sections fit).

**Repealed and omitted sections.** The corpus includes repealed and
omitted sections with a status flag (not filtered out). When you
summarize one, the summary leads with that status.

**Cost.** One model call per summarize. Cheaper than the AMA mode
because there's no planning step.
`.trim(),
}
