import type { DocsEntry } from '../types'

/**
 * Federal Register spoke "How to use" entry — what the corpus contains,
 * the notices-in-waves loading disclosure, and the EO-implementation
 * cross-link (brief #12).
 */
export const aboutFrEntry: DocsEntry = {
  slug: 'about-fr',
  title: 'How to Use: Federal Register',
  summary:
    'What the Federal Register corpus contains, how the notices are loading in waves, and how documents link back to executive orders.',
  scope: { kind: 'spoke', spokeSlug: 'fr' },
  order: 9,
  content: `
**What's in it.** The daily journal of the executive branch — the
documents through which the administrative state actually acts. Three
document types: **rules** (final regulations), **proposed rules**
(NPRMs, open for comment before they harden), and **notices** (agency
actions of every other kind — sanctions designations, meetings, policy
statements). Rules and proposed rules are complete from 1994 — the
Federal Register's digital floor — to the present, updated daily.

**Notices are loading in waves.** The notice universe is enormous, so it
is arriving in priority order: sanctions and designation notices (OFAC,
State Department), immigration notices (USCIS), and significant notices
landed first; the broad historical sweep is loading now. If a notice
count looks low for an agency or an era, the wave may simply not have
reached it yet — the corpus card's live count is the current state.
Newly loaded notices are keyword-searchable immediately and become
semantically searchable as the embedding queue catches up.

**The executive-order link.** Federal Register documents cite the
executive orders they implement, and the corpus captures those citations.
That's what connects a sanctions notice back to the national-emergency EO
it enforces, and it pairs naturally with the Presidential Documents
corpus next door — EO on one side, the regulatory machinery executing it
on the other.

**Searching tip.** Regulatory language is formal: "sanctions" appear as
"blocking property," a "ban" is a "prohibition on transactions." The
semantic toggle bridges the vocabulary gap. The structured filters are
strong here — agency, document type, RIN, CFR title and part, significant
rules, comment windows, publication and effective dates — so narrowing
first and reading second usually beats broad keyword search.

**Demo queries:** "What Biden-era gun regulations were rescinded by the
Trump administration?"; "Show me all sanctions notices emanating from the
Ukraine war"; "What is open for public comment at EPA right now?";
"Which rules implement Executive Order 14024?"
`.trim(),
}
