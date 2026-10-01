/**
 * What a link asks of the docs, and what a link inside the docs is.
 *
 * `types.ts` has said since the registry was written that a slug is "used for
 * deep-linking (`?docs=<slug>`)", and nothing read that parameter. This is the
 * reader, and with it the other half: the docs' own pages can now link — to
 * each other, to a route, to a file the app serves — and one rule says which
 * of those a link is.
 *
 * Pure, so the rule is tested without a browser (`request.test.ts`).
 */

/**
 * The docs entry a page was opened asking for: `?docs=<slug>`. Returns the
 * slug as written, or null when the parameter is absent or blank. Whether the
 * slug names an entry is the registry's to say, not this function's.
 */
export function docsRequested(search: string): string | null {
  const slug = new URLSearchParams(search).get('docs')
  return slug && slug.trim() ? slug.trim() : null
}

/**
 * What a link in a docs page does when it is pressed.
 *
 *   - `entry`: another docs page. The overlay stays open and turns to it.
 *   - `route`: somewhere else in this app. The overlay closes and the app
 *     navigates, without a reload.
 *   - `file`: something this app serves that is not a page of it — a PDF.
 *     The browser opens it in a new tab, at this deploy's mount point.
 *   - `outside`: anything else. The browser has it, in a new tab.
 */
export type DocsLink =
  | { kind: 'entry'; slug: string }
  | { kind: 'route'; to: string }
  | { kind: 'file'; to: string }
  | { kind: 'outside'; href: string }

/**
 * Docs pages write their links as *logical* paths — `/explorer`,
 * `/?docs=giving-feedback`, `/guides/connect-claude.pdf` — the way the rest
 * of the app speaks, and the caller adds the mount prefix (`toHref`). An href
 * that does not start with a single slash is somebody else's.
 */
export function docsLink(href: string): DocsLink {
  // `//host/x` and `/\host/x` leave the origin while looking like a path; the
  // same guard `lib/in-app-href.ts` keeps, for the same reason.
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\')) {
    return { kind: 'outside', href }
  }
  const cut = href.search(/[?#]/)
  const path = cut === -1 ? href : href.slice(0, cut)
  const query = cut === -1 ? '' : href.slice(cut).split('#')[0]

  const slug = docsRequested(query)
  if (slug !== null) return { kind: 'entry', slug }
  // A last segment with an extension is a file: the router has no route with
  // a dot in it, and would answer one with "Not found".
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return { kind: 'file', to: href }
  return { kind: 'route', to: href }
}
