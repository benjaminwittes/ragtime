import type { DocsEntry } from '../types'

/**
 * Global "Giving feedback" entry.
 *
 * Rewritten because the entry promised a control the public build does not
 * draw. The star rating + note (`spokes/components/UsageLogAnnotation.tsx`)
 * renders only when the private usage-log toggle is on or the session is in
 * demo mode, and the toggle is compiled out unless `VITE_ENABLE_USAGE_LOG=1`
 * (`lib/usage-log.ts` — "the public beta never uses demo"). The Explorer's
 * pointing widget (`explorer/components/Point.tsx`) returns null unless
 * `VITE_POINT_URL` is set, and `explorer/config.ts` defaults it to empty —
 * `explorer.css` says in as many words that nothing in this repo sets it.
 *
 * So no in-app feedback control ships today. What survives is the half that
 * was always the useful one: what a report has to contain to be actionable.
 * If either affordance is switched on, describe it here from the code rather
 * than from memory.
 */
export const givingFeedbackEntry: DocsEntry = {
  slug: 'giving-feedback',
  title: 'Giving Feedback',
  summary: "How to report a result that's off, or a search that didn't find what it should have.",
  scope: { kind: 'global' },
  order: 9,
  content: `
RAGtime is in beta, and feedback on search and AI quality is the most
useful thing you can send.

**There is no feedback button on this build.** Two were written and neither
is switched on here: a star rating and note under an AI answer, which is an
internal tuning instrument rather than a product feature, and a *Send
feedback* panel on the Explorer, which appears only where a build has been
given an address to send to. If you see either one, use it. Otherwise send
your report through whoever gave you access.

**What makes a report actionable.** A useful note is three sentences, and
they are the same three whichever way it reaches us:

- **What you did** — the corpus, the mode, and the exact words you typed. A
  query reproduces; a paraphrase does not.
- **What you expected** — the document, the count, or the kind of answer
  that should have come back, and how you know it exists.
- **What you got instead** — the answer, the miss, or the number that looks
  wrong. Paste it rather than describing it.

The reports worth the most are the specific ones: a search that missed a
document you can name, an AI answer that overreached a source you can open,
a count that disagrees with a set you can see. All three are checkable
against the record, which is why they can be fixed.
`.trim(),
}
