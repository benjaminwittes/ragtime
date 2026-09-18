import type { DocsEntry } from '../types'

/**
 * Global "Using this documentation" entry — how the help overlay works:
 * the Docs button, the ? shortcut, the inline ? markers, and the fact that
 * topics are contextual (global always; spoke topics when in a corpus).
 *
 * `components/SiteBar.tsx` is the only file that renders `DocsTrigger`, and
 * the bar is mounted once in `App` above the route switch — so the button is
 * in the same place on the hub, the Explorer and every spoke, and it does not
 * remount on navigation. The inline markers are `DocsHint`, today on the mode
 * row, the Search-by toggle, and the six detail sheets that carry a Summarize
 * action. Keep both lists tied to those call sites.
 */
export const usingDocumentationEntry: DocsEntry = {
  slug: 'using-documentation',
  title: 'Using This Documentation',
  summary: 'How the help overlay works — the ? shortcut, contextual topics, and the inline ? markers.',
  scope: { kind: 'global' },
  order: 8,
  content: `
This overlay is RAGtime's built-in documentation. There are three ways to
reach it:

- The **? Docs** button at the right of the bar at the top of every page
  opens the full topic list. On a narrow screen the word drops and the
  glyph stays.
- Press the **?** key anywhere — when you're not typing in a field — to open
  or close this panel.
- The small **?** markers beside particular controls open straight to the
  topic for that control: the row of AI modes, the Search-by toggle, and the
  Summarize button on a document's detail panel each carry one.

**Topics are contextual.** Nine global topics — this one, Auditability,
Access & cost, and so on — show everywhere, in a fixed order. When you're
inside a corpus, that corpus's own topics appear after them, so the list
stays relevant to where you are. Leaving the corpus takes them away again.

RAGtime is powerful but not always self-explanatory. The documentation is
meant to be read in small contextual bites, available when you need them,
rather than as a manual up front.
`.trim(),
}
