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
