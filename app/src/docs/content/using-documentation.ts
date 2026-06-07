import type { DocsEntry } from '../types'

/**
 * Global "Using this documentation" entry — how the help overlay works:
 * the Docs button, the ? shortcut, the inline ? markers, and the fact that
 * topics are contextual (global always; spoke topics when in a corpus).
 */
export const usingDocumentationEntry: DocsEntry = {
  slug: 'using-documentation',
  title: 'Using This Documentation',
  summary: 'How the help overlay works — the ? shortcut, contextual topics, and the inline ? markers.',
  scope: { kind: 'global' },
  order: 7,
  content: `
This overlay is RAGtime's built-in documentation. There are three ways to
reach it:

- The **Docs** button in the header opens the full topic list.
- Press the **?** key anywhere (when you're not typing in a field) to open
  or close it.
- The small **?** markers next to specific controls open straight to the
  topic for that element.

**Topics are contextual.** Global topics (this one, Auditability, Access &
cost, and so on) show everywhere. When you're inside a corpus, that
corpus's own topics appear too — so the list stays relevant to where you
are.

RAGtime is powerful but not always self-explanatory. The documentation is
meant to be read in small contextual bites, available when you need them,
rather than as a manual up front.
`.trim(),
}
