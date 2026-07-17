import type { DocsEntry } from '../types'

/**
 * Sanctions spoke "How to use" entry — the three legs (entity lists, OFAC
 * guidance, the Federal Register sanctions slice), and the candor stack
 * unique to this corpus: not-a-screening-tool, no designation dates on the
 * entity list, and current-lists-only coverage (brief #15).
 */
export const aboutSanctionsEntry: DocsEntry = {
  slug: 'about-sanctions',
  title: 'How to Use: Sanctions',
  summary:
    'OFAC’s sanctions lists, OFAC guidance, and Federal Register sanctions actions — and why this is a research tool, not a screening tool.',
  scope: { kind: 'spoke', spokeSlug: 'sanctions' },
  order: 9,
  content: `
**What's in it.** Three connected collections. First, OFAC's sanctions
lists as we mirror them nightly — every current entry on the SDN and
consolidated (non-SDN) lists (~19,600: entities, individuals, vessels, and
aircraft), with aliases, addresses, programs, executive orders, identity
documents, and relationships. Second, OFAC's published guidance — 1,475
FAQs, enforcement actions, and general licenses. Third, the Federal
Register's sanctions actions (~4,200 documents): OFAC's own notices, State
Department terrorist-designation notices, and anything citing a sanctions
executive order.

**Not a screening tool.** This is the one thing to know before anything
else. OFAC's official Sanctions List Search
(sanctionssearch.ofac.treas.gov) is the authoritative source for sanctions
screening; our copy lags OFAC's publication (the banner shows the exact
list-data date) and must never be used to clear, block, or flag anyone.
Every entity card links OFAC's own page for that entry.

**Searching the lists.** The name search is alias-aware — "Wagner" finds
PMC Wagner and entries listed only under an a.k.a. — and matches partial
names and identifiers. No match here is NOT clearance: delisted entries
vanish from the current lists, transliteration varies, and our copy lags.

**No designation dates — by the data's design.** The entity list is a
snapshot of the *current* lists; the only date it carries is when OFAC
published the list data we hold. "Since when has X been sanctioned" is
answered by the *designation notice* — search the Federal Register tab, or
just ask the AI, which knows to look there.

**Guidance vs. regulations.** The guidance tab is what OFAC *publishes* —
FAQs (including the 50 percent rule), enforcement actions, general
licenses. The sanctions *regulations* themselves (31 CFR chapter V) live
in RAGtime's CFR corpus. 31 guidance documents carry no issue date.

**Ask (AI) routes by question shape.** "Is X sanctioned?" runs SQL over
the entity lists; "what does the 50% rule mean?" reads the guidance and
Federal Register; "how many entities under EO 14024?" computes the count
and shows every query and its rows. You always see which route your
question took, and why.

**Demo queries:** "Is the Wagner Group sanctioned — and under which
programs and executive orders?"; "What does OFAC's 50 percent rule mean
for companies owned by sanctioned people?"; "How many entities are
sanctioned under EO 14024, the Russia authority?"; "How does a group get
designated a Foreign Terrorist Organization?"
`.trim(),
}
