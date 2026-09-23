import type { DocsEntry } from '../types'

/**
 * Sanctions spoke "How to use" entry — three collections, and the candor
 * stack unique to this corpus: not a screening tool, no designation dates,
 * current lists only.
 */
export const aboutSanctionsEntry: DocsEntry = {
  slug: 'about-sanctions',
  title: 'How to Use: Sanctions',
  summary: 'OFAC lists, guidance and Federal Register actions — research, never screening.',
  scope: { kind: 'spoke', spokeSlug: 'sanctions' },
  order: 9,
  content: `
**What's in it.** Three connected collections. OFAC's sanctions lists as we
mirror them nightly — every current entry on the SDN and consolidated
(non-SDN) lists, about 19,600 entities, individuals, vessels and aircraft,
with aliases, addresses, programs, executive orders and relationships. OFAC's
published guidance — 1,475 FAQs, enforcement actions and general licenses.
And about 4,200 Federal Register sanctions actions: OFAC's notices, State
Department terrorist designations, and anything citing a sanctions executive
order.

**Not a screening tool.** OFAC's own Sanctions List Search
(sanctionssearch.ofac.treas.gov) is authoritative for screening. Our copy
lags OFAC's publication — the banner shows the list-data date — and must
never be used to clear, block or flag anyone. The name search is alias-aware,
so "Wagner" finds PMC Wagner and entries listed only under an a.k.a., but no
match here is *not* clearance: delisted entries vanish from the current
lists, transliteration varies, and our copy lags.

**No designation dates, by the data's design.** The entity list is a snapshot
of the *current* lists, and the only date it carries is when OFAC published
the data we hold. "Since when has X been sanctioned" is answered by the
designation notice: search the Federal Register tab, or ask the AI, which
knows to look there.

**Guidance is not regulations.** The guidance tab holds what OFAC
*publishes*: FAQs including the 50 percent rule, enforcement actions, general
licenses. The regulations themselves (31 CFR chapter V) live in the CFR
corpus, and 31 guidance documents carry no issue date.

**Demo queries:** "Is the Wagner Group sanctioned — and under which
programs and executive orders?"; "What does OFAC's 50 percent rule mean
for companies owned by sanctioned people?"; "How many entities are
sanctioned under EO 14024, the Russia authority?"; "How does a group get
designated a Foreign Terrorist Organization?"
`.trim(),
}
