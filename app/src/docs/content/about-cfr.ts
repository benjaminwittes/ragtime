import type { DocsEntry } from '../types'

/**
 * CFR spoke "How to use" entry — every federal regulation: coverage,
 * per-section currency, the title/chapter/part/section structure and how
 * agency routing works through it, the statute-regulation link caveat,
 * what it's good for, and demos.
 */
export const aboutCfrEntry: DocsEntry = {
  slug: 'about-cfr',
  title: 'How to use: Code of Federal Regulations',
  summary: 'Every federal regulation — coverage, agency structure, and per-section currency.',
  scope: { kind: 'spoke', spokeSlug: 'cfr' },
  order: 9,
  content: `
**What's in it.** The entire Code of Federal Regulations — all 49 titles,
227,554 sections — the codified rules of the federal executive agencies.

**Currency is per-section.** Each section carries its own
"up-to-date-as-of" date (shown on the section), because the CFR is amended
piecemeal, agency by agency. A header date is the corpus snapshot; the
per-section date is the authoritative one. (eCFR is the always-current
official mirror; we snapshot it.)

**How regulations are organized.** Title → chapter → part → section, where
the chapter identifies the issuing agency. Agency routing here works through
the title/chapter structure, so "EPA regulations on X" resolves via the
chapter that belongs to EPA.

**The statute-regulation link.** A regulation is only enforceable because
some statute authorizes it — and sometimes makes violating it a crime. That
enabling-authority chain (CFR → U.S. Code) isn't auto-traversed yet; when
it matters, the AI flags it as a caveat rather than silently bridging it.
Keep it in mind for "is this conduct actually prohibited / penalized"
questions.

**What it's good for.** Compliance questions (what does the rule require),
authority questions (which agency, under what power), and framework
questions (how a regulatory scheme fits together). Structured filters —
title, agency, part, heading, currency — are free.

**Demo queries:** "HIPAA Privacy Rule requirements"; pull 8 CFR § 208.30;
filter Title 40 (EPA) by part.
`.trim(),
}
