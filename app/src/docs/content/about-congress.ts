import type { DocsEntry } from '../types'

/** Congress spoke "How to use" entry — five collections and their floors. */
export const aboutCongressEntry: DocsEntry = {
  slug: 'about-congress',
  title: 'How to Use: Congress',
  summary: 'Five collections, from public laws to hearing transcripts, and their coverage floors.',
  scope: { kind: 'spoke', spokeSlug: 'congress' },
  order: 9,
  content: `
**What's in it.** The legislative branch across five collections, about 1.2
million documents. Each has its own coverage floor, and a count question
reflects that floor rather than all of congressional history:

- **Public laws** — every law enacted since 1789.
- **Bills** — from the 108th Congress (2003); full text from the 113th
  (2013), earlier bills metadata only.
- **Hearing transcripts** — committee hearings back to 1933, parsed into
  per-speaker turns.
- **The Congressional Record** — floor debate and proceedings from 1994.
- **Witness testimony** — written statements to House committees, 118th–119th
  Congresses only.

**The "who said what" surface.** Hearing transcripts are split into roughly
seven million speaker turns, member questions paired with witness answers.
That is what answers "what has the FBI Director said about this across his
last five appearances". Attribution covers 86% of turns, about 94% in the
modern era, and an ambiguous speaker is flagged as ambiguous rather than
guessed.

**Searching tip.** Congressional speech is a different register: witnesses
"decline to answer" rather than refuse, and programs go by nickname before
they have a statutory name. For hearings, filtering the turns by speaker,
committee or topic is usually faster than keyword search.

**Demo queries:** "Find every time Pam Bondi has been asked about the
Epstein files"; "Trace the legislative history of FISA Section 702";
"Which FISA-reform bills actually became law?"; "What has Congress ever
heard about the National Endowment for Democracy?"
`.trim(),
}
