import type { DocsEntry } from '../types'

/**
 * Global "Giving feedback" entry — how to flag an off result or a search
 * that missed, via the per-result rating (star) + note tied to the exact
 * query and machine trace. The most useful thing a beta user can send.
 */
export const givingFeedbackEntry: DocsEntry = {
  slug: 'giving-feedback',
  title: 'Giving Feedback',
  summary: "How to flag a result that's off, or a search that didn't find what it should have.",
  scope: { kind: 'global' },
  order: 8,
  content: `
RAGtime is in beta, and feedback on search and AI quality is the most
useful thing you can send.

On an AI result, you can rate it (★) and leave a short note about what was
good or wrong. That's tied to the exact query and the machine trace behind
it, so a problem can be diagnosed from what actually happened rather than
from a recollection. Please use this feature liberally — it's the best
feedback mechanism we have to improve and fine-tune the query engines.

When something's off — a search that missed an obvious document, an AI
answer that overreached, a count that looks wrong — the most helpful note
says what you searched, what you expected, and what you got.
`.trim(),
}
