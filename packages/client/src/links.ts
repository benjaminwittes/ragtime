/**
 * The deep-link grammar (contract §5, frozen 2026-09-08 on ragtime-dev#168).
 *
 *   /corpus/:slug?q=<text>&<facet>=<value>[&<facet>=<value>…]&ids=<id,id,…>&mode=manual_filter|claude_ama
 *   /corpus/:slug/:id                     → opens the detail sheet on load
 *   rt://<slug>/<id>                      → the citation form; resolves to /corpus/:slug/:id
 *
 * This module is the only writer of these URLs in the browser UXs and the
 * only reader (`parse`). The worker writes `handoff` URLs of the same shape
 * (`/corpus/<slug>?q=`, `?ids=&mode=manual_filter`, `/corpus/<slug>/<id>`),
 * so `workspace()` and `document()` are byte-for-byte what it emits for the
 * same inputs — one grammar, two emitters that agree, one parser.
 *
 * Reserved parameter names are `q`, `ids` and `mode`. Facet parameter names
 * are each spoke's declared FacetSpec names; a facet named like a reserved
 * parameter is a lint failure at the spoke, and `workspace()` refuses it too.
 * Multi-valued facets repeat the parameter (`&court=dcd&court=ca9`).
 *
 * Paths are origin-relative. The app prefixes its own origin when it needs a
 * full URL; the model never sees a URL at all (it writes rt://).
 */

export type LinkMode = 'manual_filter' | 'claude_ama'

export const LINK_MODES: readonly LinkMode[] = ['manual_filter', 'claude_ama']
export const RESERVED_PARAMS: readonly string[] = ['q', 'ids', 'mode']

/** A slug is a registry slug, optionally collection-qualified (`congress:laws`). */
const SLUG = /^[a-z_]+(?::[a-z_]+)?$/
/** A document id as the worker's citation regex admits it. */
const ID = /^[A-Za-z0-9:_.-]{1,80}$/
const CITATION = /^rt:\/\/([a-z_]+(?::[a-z_]+)?)\/([A-Za-z0-9:_.-]{1,80})$/
const PATH = /^\/corpus\/([a-z_]+(?::[a-z_]+)?)(?:\/([A-Za-z0-9:_.-]{1,80}))?\/?$/

export type WorkspaceLink = {
  slug: string
  q?: string
  /** Facet name → one value or several. Names must not be reserved. */
  facets?: Record<string, string | readonly string[]>
  ids?: readonly (string | number)[]
  mode?: LinkMode
}

export type DocumentLink = { slug: string; id: string | number }

export type ParsedLink = {
  slug: string
  /** Present for `/corpus/:slug/:id`. */
  id?: string
  q?: string
  /** Every non-reserved parameter, multi-valued. Empty object when none. */
  facets: Record<string, string[]>
  ids?: string[]
  mode?: LinkMode
}

function assertSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new Error(`links: not a corpus slug: "${slug}"`)
  return slug
}

function assertId(id: string | number): string {
  const s = String(id)
  if (!ID.test(s)) throw new Error(`links: not a document id: "${s}"`)
  return s
}

/** `/corpus/:slug?q=…&<facet>=…&ids=…&mode=…` — parameters only when given, in that order. */
export function workspace(link: WorkspaceLink): string {
  const slug = assertSlug(link.slug)
  const parts: string[] = []
  if (link.q !== undefined && link.q !== '') parts.push('q=' + encodeURIComponent(link.q))
  if (link.facets) {
    for (const name of Object.keys(link.facets)) {
      if (RESERVED_PARAMS.includes(name)) throw new Error(`links: facet "${name}" collides with a reserved parameter`)
      if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error(`links: not a facet name: "${name}"`)
      const raw = link.facets[name]
      const values = typeof raw === 'string' ? [raw] : raw
      for (const v of values) parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(v))
    }
  }
  if (link.ids && link.ids.length) parts.push('ids=' + encodeURIComponent(link.ids.map(assertId).join(',')))
  if (link.mode !== undefined) {
    if (!LINK_MODES.includes(link.mode)) throw new Error(`links: not a mode: "${String(link.mode)}"`)
    parts.push('mode=' + link.mode)
  }
  return '/corpus/' + slug + (parts.length ? '?' + parts.join('&') : '')
}

/** `/corpus/:slug/:id` — the detail sheet. */
export function document(link: DocumentLink): string {
  return '/corpus/' + assertSlug(link.slug) + '/' + assertId(link.id)
}

/** `rt://slug/id` → `{ slug, id }`, or null when the string is not a citation. */
export function parseCitation(rt: string): { slug: string; id: string } | null {
  const m = CITATION.exec(rt.trim())
  return m ? { slug: m[1]!, id: m[2]! } : null
}

/** `rt://slug/id` → `/corpus/slug/id`. Throws on anything that is not a citation. */
export function fromCitation(rt: string): string {
  const c = parseCitation(rt)
  if (!c) throw new Error(`links: not an rt:// citation: "${rt}"`)
  return document(c)
}

/**
 * The one reader. Accepts a path (`/corpus/olc?q=…`) or an absolute URL and
 * returns its parts, or null when the path is not a corpus link. Facet
 * values and ids come back decoded; `mode` is dropped when it is not one of
 * the two the grammar names.
 */
export function parse(url: string): ParsedLink | null {
  let u: URL
  try {
    u = new URL(url, 'http://links.invalid')
  } catch {
    return null
  }
  const m = PATH.exec(u.pathname)
  if (!m) return null
  const out: ParsedLink = { slug: m[1]!, facets: {} }
  if (m[2]) out.id = m[2]
  const q = u.searchParams.get('q')
  if (q !== null && q !== '') out.q = q
  const ids = u.searchParams.get('ids')
  if (ids !== null && ids !== '') out.ids = ids.split(',').filter((s) => s !== '')
  const mode = u.searchParams.get('mode')
  if (mode !== null && (LINK_MODES as readonly string[]).includes(mode)) out.mode = mode as LinkMode
  for (const name of new Set(u.searchParams.keys())) {
    if (RESERVED_PARAMS.includes(name)) continue
    out.facets[name] = u.searchParams.getAll(name)
  }
  return out
}

export const links = { workspace, document, fromCitation, parseCitation, parse }
