/**
 * Base-path-aware routing helpers.
 *
 * The app speaks in *logical* paths (`/`, `/corpus/<slug>`) everywhere — route
 * parsing, `href` attributes, and `onNavigate` calls. But the deployed mount
 * point is not always the origin root: on GitHub Pages the site lives under the
 * `/ragtime/` subpath, while a future custom domain (ragtime.lawfaremedia.org)
 * serves at `/`. Vite injects the configured `base` as `import.meta.env.BASE_URL`
 * (always leading+trailing slash, e.g. `/ragtime/` or `/`), so the subpath→root
 * move is a `vite.config` one-liner — no router changes — because these helpers
 * translate between logical paths and real URLs at the single seam in App.tsx.
 */

import { links, type ParsedLink } from './links'

// `/ragtime/` or `/` — guaranteed leading+trailing slash by Vite.
const BASE = import.meta.env.BASE_URL
// `/ragtime` or `` (empty when mounted at root).
const BASE_PREFIX = BASE.replace(/\/$/, '')

/** Logical path → real URL for `href`/`pushState`. `/` → BASE, `/corpus/x` → `<prefix>/corpus/x`. */
export function toHref(logicalPath: string): string {
  if (logicalPath === '/' || logicalPath === '') return BASE
  return BASE_PREFIX + logicalPath
}

/** Real `window.location.pathname` → logical path by stripping the mount prefix. */
export function toLogical(pathname: string): string {
  if (BASE_PREFIX && pathname.startsWith(BASE_PREFIX)) {
    const rest = pathname.slice(BASE_PREFIX.length)
    return rest === '' ? '/' : rest
  }
  return pathname
}

/**
 * The cross-corpus keyword carried into a spoke via `?q=` (hub → workspace
 * carryover). A spoke reads this on mount to prefill its search field and
 * auto-run its filter, so the hub's "Open workspace →" lands on the responsive
 * documents rather than the full corpus. Returns null when absent/blank.
 */
export function readCarryoverQuery(): string | null {
  const q = new URLSearchParams(window.location.search).get('q')
  return q && q.trim() ? q.trim() : null
}

/**
 * The deep link this page was opened on, read once by a spoke shell on mount.
 * The grammar (`lib/links.ts`) is what the Explorer's handoffs and `rt://`
 * citations resolve to:
 *
 *   /corpus/:slug?q=…&<facet>=<value>…&ids=<id,…>&mode=manual_filter|claude_ama
 *   /corpus/:slug/:id                 → open that document's detail sheet
 *
 * Returns null off the grammar (the hub, `/privacy`, a not-found path). The
 * `?q=` carryover above is this link's `q`; it keeps its own reader because
 * every shell already calls it and its trim/blank rule is its own.
 */
export function readDeepLink(): ParsedLink | null {
  return links.parse(toLogical(window.location.pathname) + window.location.search)
}
