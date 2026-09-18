import type { DocsEntry } from '../types'

/**
 * Global "Giving feedback" entry. It promises no in-app control, because the
 * public build draws none: the star rating
 * (`spokes/components/UsageLogAnnotation.tsx`) is compiled out unless
 * `VITE_ENABLE_USAGE_LOG=1`, and `explorer/components/Point.tsx` returns null
 * unless `VITE_POINT_URL` is set, which nothing in this repo sets.
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

**There is no feedback button on this build.** Two were written and neither
is switched on here: a star rating under an AI answer, and a *Send feedback*
panel on the Explorer that appears only where a build has been given an
address to send to. If you see either, use it. Otherwise send your report
through whoever gave you access.

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
