import type { DocsEntry } from '../types'

/**
 * FBI Records spoke "How to use" entry — what the corpus contains, the
 * removed-and-recovered provenance story, and the two disclosures unique to
 * this corpus: no document dates and variable OCR quality (brief #14).
 */
export const aboutFbiEntry: DocsEntry = {
  slug: 'about-fbi',
  title: 'How to Use: FBI Records',
  summary:
    'What the FBI Records corpus contains, how removed Vault documents were recovered, and why there is no date filter.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 9,
  content: `
**What's in it.** The FBI's own FOIA reading room — the Vault
(vault.fbi.gov) — as this project preserved it: 10,746 released documents
across 1,755 subject collections, from COINTELPRO and the Rosenberg case
to Amerithrax, Jonestown, and D.B. Cooper. These are the Bureau's own
scanned files: memos, teletypes, lab reports, and correspondence, released
under FOIA with the Bureau's redactions intact.

**Removed and recovered.** 1,627 of these documents were on the Vault and
have since been taken down. Our copies come from Wayback Machine captures;
each carries a quiet "removed from the Vault" badge with its capture date,
and the detail panel links the original Vault URL the capture preserved.
The Provenance filter isolates them ("Removed from the Vault — recovered").

**No document dates — by the source's design.** The Vault publishes scans
without dates, so this corpus has no date filter and no date sort — the
only spoke where that's true. "Documents *about* 1965" works fine as a
content search; "documents *from* 1965" is not a question the corpus can
answer, and the AI modes will say so rather than fake a chronology.

**Collections are the browse spine.** Every document files under a Vault
subject. The Collection box in the filter is a typeahead over all 1,755
subjects — start typing and pick one (the stored names are messy: slugs
like "rosenberg-case" next to human titles like "Kansas City Massacre";
the typeahead handles both spellings).

**Searching tip.** These are OCR'd historical records in period
vocabulary. The Bureau's own program names rarely match modern phrasing —
"COINTELPRO" appears in the pages as "counterintelligence program," and
subjects hide under codenames and file jargon. Try the era's own terms, or
the semantic toggle to bridge the vocabulary gap. OCR quality varies
(clean / normalized / degraded, badged on every row) — treat verbatim
wording from degraded scans with care; the PDF link on every row holds the
original.

**Coverage candor.** This is the Vault as preserved — the FBI's chosen
FOIA postings, not all FBI records and not current investigations. Absence
here is absence from the Vault, not evidence the FBI holds nothing.

**Demo queries:** "What do the FBI's files show about the 9/11
investigation?"; "What was COINTELPRO, according to the Bureau's own
records?"; "What's in the FBI's file on the Rosenberg case?"; "How did the
FBI investigate the anthrax letters (Amerithrax)?"
`.trim(),
}
