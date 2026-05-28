/**
 * Docs-registry types.
 *
 * The docs registry is the cross-cutting documentation infrastructure
 * established in brief #6 §6 (the "v1 modifications" that delete the
 * welcome card and move "How to use" into floating documentation).
 *
 * Entries are markdown content keyed by slug and scoped either globally
 * (cross-cutting principles, auditability, etc.) or to a specific corpus
 * spoke ("How to use the litigation surface", "About FRUS", etc.).
 *
 * v1 = infrastructure only (PR 4a). Editorial content per spoke is a
 * later editorial pass (PR 4b or staged with each spoke's implementation).
 *
 * Cross-references to the strategic briefs:
 * - brief #6 §6 — welcome card removal; "How to use" → floating documentation
 * - brief #6 §6 — mode-button tooltips deleted when floating documentation
 *   lands (so this infrastructure replaces both surfaces)
 * - brief #7 §2 — per-collection plain-English disclosure is *not* the same
 *   as docs entries (that's surfaced in the header band); docs entries are
 *   the longer-form "how to use this" content.
 */

import type { CorpusSlug } from '@/spokes/types'

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
