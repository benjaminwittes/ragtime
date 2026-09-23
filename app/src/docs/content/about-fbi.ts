import type { DocsEntry } from '../types'

/**
 * FBI Records spoke "How to use" entry.
 *
 * Two disclosures are unique to this corpus and load-bearing: the Vault
 * publishes no document dates, and the Collection box matches the Bureau's
 * stored slug as a case-insensitive substring, hyphens and underscores read
 * as spaces. "COINTELPRO" and "D.B. Cooper" match nothing — keep the worked
 * examples.
 */
export const aboutFbiEntry: DocsEntry = {
  slug: 'about-fbi',
  title: 'How to Use: FBI Records',
  summary: 'The preserved FBI Vault — what it holds, and why it has no date filter.',
  scope: { kind: 'spoke', spokeSlug: 'fbi' },
  order: 9,
  content: `
**What's in it.** The FBI's own FOIA reading room — the Vault — as this
project preserved it: 10,746 released documents across 1,755 subject
collections, from COINTELPRO and the Rosenberg case to Amerithrax and D.B.
Cooper, released with the Bureau's redactions intact. 1,627 have since been
taken down from the Vault; our copies come from Wayback Machine captures,
badged with a capture date and isolated by the Provenance filter.

**No document dates, by the source's design.** The Vault publishes scans
without dates, so this corpus has no date filter and no date sort — the only
spoke where that is true. "Documents *about* 1965" works as a content search;
"documents *from* 1965" is not a question the corpus can answer, and the AI
modes say so rather than fake a chronology.

**Collections are the browse spine**, and the Collection box is a typeahead
over all 1,755. Pick from the list rather than typing a name through: the
stored names are the Bureau's rather than English — some slugs
("rosenberg-case", "cointel-pro"), some titles ("Kansas City Massacre") — and
the box matches your text as a substring of the stored value, with hyphens
and underscores read as spaces and nothing else. So "Cointel Pro" finds the
COINTELPRO files and "COINTELPRO" finds nothing; "D B Cooper" works and
"D.B. Cooper" does not.

**Two honest limits.** These are OCR'd records in period vocabulary, and the
Bureau's program names rarely match modern phrasing, so try the era's own
terms or the semantic toggle; OCR quality is badged clean, normalized or
degraded on every row. And this is the Vault as preserved, not all FBI
records, so absence here is absence from the Vault.

**Demo queries:** "What do the FBI's files show about the 9/11
investigation?"; "What was COINTELPRO, according to the Bureau's own
records?"; "What's in the FBI's file on the Rosenberg case?"; "How did the
FBI investigate the anthrax letters (Amerithrax)?"
`.trim(),
}
