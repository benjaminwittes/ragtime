import type { DocsEntry } from '../types'

/**
 * Congress spoke "How to use" entry — the five collections, the coverage
 * floors per collection, the speaker-attribution candor rule, and the
 * "who said what" turns surface (brief #13).
 */
export const aboutCongressEntry: DocsEntry = {
  slug: 'about-congress',
  title: 'How to Use: Congress',
  summary:
    'What the congressional corpus contains — five collections from public laws to hearing transcripts — and the coverage floors to keep in mind.',
  scope: { kind: 'spoke', spokeSlug: 'congress' },
  order: 9,
  content: `
**What's in it.** The legislative branch across five collections — about
1.2 million documents in all, with a selector that routes between them:

- **Public laws** — every law enacted since 1789.
- **Bills** — from the 108th Congress (2003) forward; full text begins
  with the 113th (2013), earlier bills are metadata-only.
- **Hearing transcripts** — committee hearings back to 1933, parsed into
  per-speaker turns.
- **The Congressional Record** — floor debate and proceedings from 1994
  forward.
- **Witness testimony** — written statements submitted to House
  committees, 118th–119th Congresses.

**The "who said what" surface.** Hearing transcripts are split into
roughly seven million speaker turns — member questions paired with
witness answers. That's what powers questions like "what has the FBI
Director said about this across his last five appearances." One honesty
rule throughout: attribution covers 86% of turns (about 94% in the
modern era); where a speaker is ambiguous, the turn is *flagged as
ambiguous*, never guessed.

**Coverage floors to keep in mind.** Each collection has its own floor —
laws reach 1789, hearings 1933, the Record 1994, bill text 2013. A count
question ("how many bills mention X") reflects the collection's floor,
not all of congressional history, and the system flags this on count
questions. Written testimony is House-only and recent — two Congresses.

**Searching tip.** Congressional speech is a different register from
statutory text: witnesses "decline to answer" rather than "refuse,"
programs are discussed by nickname before they have a statutory name.
Semantic search bridges some of that; for hearings, the turns surface
(filter by speaker, committee, or topic) is usually the faster road than
raw keyword search.

**Demo queries:** "Find every time Pam Bondi has been asked about the
Epstein files"; "Trace the legislative history of FISA Section 702";
"Which FISA-reform bills actually became law?"; "What has Congress ever
heard about the National Endowment for Democracy?"
`.trim(),
}
