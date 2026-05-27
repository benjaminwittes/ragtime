import type { DocsContext, DocsEntry } from './types'

/**
 * Central docs registry.
 *
 * v1 = empty. Content is editorial work pending (PR 4b — likely
 * landing alongside the litigation spoke port in PR 5, so the first
 * spoke's docs are written against the real surface, not a stub).
 *
 * To add an entry: import its `DocsEntry`-typed object from a per-topic
 * file (probably `./content/<slug>.ts`) and add it to the array below.
 *
 * Editorial intent (per brief #6 §6, brief #6 decisions 9b cross-reference):
 * - Global entries cover cross-cutting principles users should know once:
 *   auditability, free-tier metadata floor, dual output, the stack-of-
 *   operations refinement pattern, what the docs registry / `?` shortcut
 *   does, how to provide feedback.
 * - Spoke entries cover per-corpus "How to use this surface" content: what
 *   the surface is for, what's in the corpus and what's not, how the
 *   modes differ here, demo queries.
 */
export const docsEntries: readonly DocsEntry[] = []

/**
 * Selector — returns the entries that should show in the overlay given
 * the current navigation context. Global entries always; spoke entries
 * only when their spokeSlug matches the active context.
 */
export function selectDocsForContext(ctx: DocsContext): readonly DocsEntry[] {
  return docsEntries
    .filter((entry) => {
      if (entry.scope.kind === 'global') return true
      return entry.scope.spokeSlug === ctx.activeSpokeSlug
    })
    .sort((a, b) => {
      const orderA = a.order ?? Number.POSITIVE_INFINITY
      const orderB = b.order ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return a.title.localeCompare(b.title)
    })
}

/** Lookup helper for deep-linking (?docs=<slug>). */
export function getDocsEntry(slug: string): DocsEntry | undefined {
  return docsEntries.find((e) => e.slug === slug)
}
