import type { DocsEntry } from '../types'

/** CFR spoke "How to use" entry. */
export const aboutCfrEntry: DocsEntry = {
  slug: 'about-cfr',
  title: 'How to use: Code of Federal Regulations',
  summary: 'Every federal regulation — coverage, agency structure, and per-section currency.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 9,
  content: `
**What's in it.** The entire Code of Federal Regulations — all 49 titles,
more than 227,000 sections — the codified rules of the federal executive
agencies.

**Currency is per-section.** The CFR is amended piecemeal, agency by agency,
so each section carries its own "up-to-date-as-of" date and that is the
authoritative one. A header date is only the corpus snapshot. (eCFR is the
always-current official mirror; we snapshot it.)

**How it's organized.** Title → chapter → part → section, where the chapter
identifies the issuing agency — so "EPA regulations on X" resolves through
the chapter that belongs to EPA.

**The statute-regulation link.** A regulation is enforceable only because
some statute authorizes it, and sometimes makes violating it a crime. That
chain (CFR → U.S. Code) is not traversed here; the AI flags it as a caveat
rather than silently bridging it. Keep it in mind for "is this conduct
actually prohibited" questions.

**What it's good for.** Compliance questions, authority questions, and how a
regulatory scheme fits together. Structured filters — title, agency, part,
heading, currency — are free.

**Demo queries:** "HIPAA Privacy Rule requirements"; pull 8 CFR § 208.30;
filter Title 40 (EPA) by part.
`.trim(),
}
