import type { DocsEntry } from '../types'

/** Federal Register spoke "How to use" entry. */
export const aboutFrEntry: DocsEntry = {
  slug: 'about-fr',
  title: 'How to Use: Federal Register',
  summary: 'What the Federal Register corpus holds, and how its notices are still loading.',
  scope: { kind: 'spoke', spokeSlug: 'fr' },
  order: 9,
  content: `
**What's in it.** The daily journal of the executive branch: **rules** (final
regulations), **proposed rules** (open for comment before they harden), and
**notices** (agency actions of every other kind, from sanctions designations
to meetings). Rules and proposed rules are complete from 1994 — the Federal
Register's digital floor — and updated daily.

**Notices are loading in waves**, in priority order: sanctions and
designation notices, immigration notices, other significant notices first,
the broad historical sweep now. A notice count that looks low for an agency
or an era may be a wave that has not arrived; this spoke's holdings band
carries the current figure. New notices are keyword-searchable at once and
semantically searchable once the embedding queue catches up.

**The executive-order link.** These documents cite the executive orders they
implement, and the corpus captures those citations — which is what connects a
sanctions notice back to the national-emergency order it enforces.

**Searching tip.** The language is formal: sanctions appear as "blocking
property", a ban as a "prohibition on transactions". The semantic toggle
bridges that, and the structured filters (agency, document type, RIN, CFR
title and part, comment windows, publication and effective dates) are strong
enough that narrowing first usually beats a broad keyword search.

**Demo queries:** "What Biden-era gun regulations were rescinded by the
Trump administration?"; "Show me all sanctions notices emanating from the
Ukraine war"; "What is open for public comment at EPA right now?";
"Which rules implement Executive Order 14024?"
`.trim(),
}
