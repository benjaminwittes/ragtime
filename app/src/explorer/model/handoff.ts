/**
 * A corpus surface handing the reader to the Explorer with corpora pinned.
 *
 * `?pin=<slug>[,<slug>…]` on `/explorer`. The Explorer reads it once, at boot, and
 * opens a new conversation with those corpora pinned rather than pinning them into
 * whatever conversation the reader left open: a pin is a statement about what the
 * next question is about, and the conversation set aside stays in the list.
 *
 * The first caller is the litigation workspace (UI/UX live document: "AMA button
 * doesn't appear in the federal court litigation workspace"). Litigation is served
 * live from CourtListener, so the per-corpus AMA, which planned SQL over a mirror,
 * is retired there; the Explorer researches litigation through the same live search,
 * so the AMA entry there is this hand-off.
 */

const SLUG = /^[a-z][a-z0-9-]{0,40}$/
/** More than this is not a pin, it is the whole registry. */
const MAX_PINS = 6

/** The pinned corpora a page was opened with, or null when it carries none worth reading. */
export function readPin(search: string): string[] | null {
  const raw = new URLSearchParams(search).get('pin')
  if (!raw) return null
  const slugs = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => SLUG.test(s)))]
  return slugs.length && slugs.length <= MAX_PINS ? slugs : null
}

/** The Explorer, opened on a new conversation with `slugs` pinned. */
export function explorerPinnedPath(slugs: readonly string[]): string {
  return '/explorer?' + new URLSearchParams({ pin: slugs.join(',') }).toString()
}
