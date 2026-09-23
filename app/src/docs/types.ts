/**
 * Docs-registry types.
 *
 * The docs registry is the cross-cutting documentation infrastructure from
 * brief #6 §6, which replaced two surfaces that no longer exist: the spoke
 * welcome card and the tooltips that used to hang off the mode buttons. Both
 * are gone from the app; this overlay is what stands in their place.
 *
 * Entries are markdown content keyed by slug and scoped either globally
 * (cross-cutting principles, auditability, access and cost) or to a specific
 * corpus spoke ("How to Use: OLC Opinions", "Summarize This Section").
 * The registry is populated — see `registry.ts` for the count and the
 * ordering rules. The infrastructure-only stage is long past.
 *
 * Not the same thing as a spoke's `plainEnglishDisclosure` (brief #7 §2),
 * which the spoke header renders inline and which states what a corpus holds.
 * Docs entries are the longer-form "how to use this" content behind the
 * overlay.
 */

import type { CorpusSlug } from '@lawfare/ragtime-client'

/**
 * Where in the navigation tree this docs entry applies. Global entries
 * are always available; spoke entries surface only when that spoke is
 * the active context.
 */
export type DocsScope =
  | { kind: 'global' }
  | { kind: 'spoke'; spokeSlug: CorpusSlug }

/**
 * A single documentation entry. Content is markdown — rendered with
 * react-markdown in the DocsOverlay component. Title appears in the
 * entry-list nav inside the overlay.
 */
export type DocsEntry = {
  /** Stable identifier, unique within the registry. Used for deep-linking
   * (?docs=<slug>) and for cross-references between entries. */
  slug: string
  /** Human-readable title shown in the overlay nav. */
  title: string
  /** Optional short one-line summary shown under the title in the list. */
  summary?: string
  /** Markdown content. Rendered with react-markdown; supports the standard
   * markdown subset (headings, lists, links, code blocks, inline code,
   * bold/italic, blockquotes). */
  content: string
  /** Scope: global (always visible) or tied to a specific corpus spoke. */
  scope: DocsScope
  /** Optional ordering hint within scope. Lower = earlier. Undefined =
   * trailing, sorted by title. */
  order?: number
}

/**
 * The set of docs entries that should be shown given the current
 * navigation context. Returned by `selectDocsForContext()`.
 */
export type DocsContext = {
  /** Active corpus spoke slug, if any. Undefined = the hub or a non-corpus
   * page. Global entries always show; spoke entries show only if their
   * spokeSlug matches this. */
  activeSpokeSlug?: CorpusSlug
}
