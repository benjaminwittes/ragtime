/**
 * Does this href point somewhere in this app, and if so, where?
 *
 * The Explorer's answers, trail and tool details are full of links the page itself can
 * serve — a citation is `/corpus/olc/1425`, a handoff is `/corpus/olc?q=…` — mixed in with
 * links only the browser can serve, because the model writes ordinary markdown and may
 * link anywhere. One rule decides which is which, and it is the rule for the whole app:
 * an href is ours when it addresses this origin under this deploy's mount point.
 *
 * Pure, and taking the mount prefix as an argument rather than reading
 * `import.meta.env.BASE_URL`, for a reason that is not style: `ragtime-worker`'s vitest
 * globs `app/src/lib/**` into its own suite with no alias resolution and no Vite env, so
 * anything under here that touches `import.meta.env` at module scope goes red in a repo
 * you are not looking at (vitest.config.ts, "Cross-repo caveat"). `toLogicalHref` in
 * routing.ts is the wrapper that knows the prefix.
 */

/**
 * `href` → the logical path to navigate to, or `null` when the browser should have it.
 *
 * Query and hash ride along: a workspace handoff is a path *and* its `?q=`/`?ids=`, and
 * dropping them would land the reader on an unfiltered corpus.
 */
export function inAppHref(href: string, basePrefix: string): string | null {
  // Only origin-relative paths. `//host/x` and `/\host/x` are protocol-relative — they
  // leave the origin while looking like a path, which is exactly the shape a model could
  // write into an answer.
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\')) return null

  const cut = href.search(/[?#]/)
  const path = cut === -1 ? href : href.slice(0, cut)
  const rest = cut === -1 ? '' : href.slice(cut)

  if (!basePrefix) return path + rest
  // Mounted under a subpath (`/ragtime`): the prefix must be a whole segment, so
  // `/ragtimeish/x` is somebody else's.
  if (path === basePrefix) return '/' + rest
  if (!path.startsWith(basePrefix + '/')) return null
  return path.slice(basePrefix.length) + rest
}
