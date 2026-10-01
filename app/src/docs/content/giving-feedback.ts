import type { DocsEntry } from '../types'

/**
 * Global "Giving feedback" entry. It describes the one control every build
 * draws: the Feedback button in the site bar (`feedback/Feedback.tsx`). The
 * star rating under an AI answer
 * (`spokes/components/UsageLogAnnotation.tsx`) is still compiled out of the
 * public build unless `VITE_ENABLE_USAGE_LOG=1`, so this entry mentions it
 * only as something a reader may or may not see.
 */
export const givingFeedbackEntry: DocsEntry = {
  slug: 'giving-feedback',
  title: 'Giving Feedback',
  summary: "How to report a result that's off, or a search that didn't find what it should have.",
  scope: { kind: 'global' },
  order: 5,
  content: `
RAGtime is in beta, and feedback on search and AI quality is the most useful
thing you can send.

**Use the Feedback button.** It is at the top of every page, beside Docs, and
it follows you to the bottom corner once you scroll. Write a sentence or two
and press Send. Your note goes to the people building RAGtime — not to the
AI, and not into your conversation.

**Point at the thing you mean.** Press *Point at something*, then click the
result, the number or the sentence that is wrong. The note then carries
exactly what you pointed at, so nobody has to guess which row you meant.

**What is sent.** Your words, the address of the page you are on (including
your search, which is what lets us reproduce it), what you pointed at, and
your email only if you type one because you want a reply. Nothing else.

If you see a star rating under an AI answer, that is a second way to rate
that one answer; use either.

**What makes a report actionable.** Three sentences: what you did (the
corpus, the mode, and the exact words you typed — a query reproduces, a
paraphrase does not), what you expected and how you know it exists, and what
you got instead, pasted rather than described.

The reports worth most are specific: a search that missed a document you can
name, an answer that overreached a source you can open, a count that
disagrees with a set you can see. All three are checkable, which is why they
can be fixed.
`.trim(),
}
