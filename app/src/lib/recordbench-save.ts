/**
 * "Save to Recordbench": hand documents from a search or an answer to Recordbench's save page.
 *
 * RAGtime and Recordbench have separate sign-ins, and the bench refuses a write sent from
 * another site, so this does not write. It opens the bench's save page in a new window and
 * hands it the address of each document (`rt://<corpus>/<id>`), never the text. The person
 * signs in there, picks an investigation, and saves; the bench fetches each document itself.
 *
 * The hand-off is a message between the two windows. The save page posts
 * `recordbench:save-ready` to the window that opened it; this answers once with
 * `recordbench:save`, addressed to the bench's origin and nothing else. The page reads it only
 * where the browser says it came from a site the bench names, so a page's own link cannot be
 * used to hand someone a save. Version 1 of the message carries an outcome (`document` or
 * `list`), the search's words for a list's folder, and the addresses with their titles.
 */

export const DEFAULT_RECORDBENCH_URL = 'https://recordbench.lawfaremedia.org'

/** The save page's address under the bench. */
export const SAVE_PAGE = '/#/bench/save'

export const HANDOFF_READY = 'recordbench:save-ready'
export const HANDOFF_SAVE = 'recordbench:save'
export const HANDOFF_VERSION = 1

/** The most the save page takes in one hand-off. */
export const MAX_REFS = 200

/** How long to wait for the save page to say it is ready before giving up. */
const WAIT_MS = 60_000

export type SaveItem = { corpus: string; id: string | number; title?: string | null }

export type SaveOutcome = 'document' | 'list'

export type SaveMessage = {
  type: typeof HANDOFF_SAVE
  v: typeof HANDOFF_VERSION
  outcome: SaveOutcome
  name: string | null
  refs: { ref: string; title: string | null }[]
}

/** The bench's origin, from `VITE_RECORDBENCH_URL` or the hosted bench. */
export function recordbenchOrigin(configured: string | undefined = import.meta.env.VITE_RECORDBENCH_URL): string {
  const raw = configured && configured.trim() !== '' ? configured.trim() : DEFAULT_RECORDBENCH_URL
  return new URL(raw).origin
}

/** One document's citation form, as the bench reads it. */
export function citationOf(item: SaveItem): string {
  return `rt://${item.corpus}/${item.id}`
}

/** The message the save page reads, or null when there is nothing to save. */
export function saveMessage(outcome: SaveOutcome, items: readonly SaveItem[], name?: string | null): SaveMessage | null {
  const seen = new Set<string>()
  const refs: SaveMessage['refs'] = []
  for (const item of items) {
    const ref = citationOf(item)
    if (seen.has(ref)) continue
    seen.add(ref)
    refs.push({ ref, title: item.title?.trim() || null })
    if (refs.length === MAX_REFS) break
  }
  if (refs.length === 0) return null
  if (outcome === 'document' && refs.length !== 1) return null
  const words = name?.trim()
  return { type: HANDOFF_SAVE, v: HANDOFF_VERSION, outcome, name: words ? words : null, refs }
}

/**
 * Open the save page and hand it `message` when it says it is ready. Call it from the
 * click itself, so the browser lets the window open. Returns false when it could not.
 */
export function openSave(message: SaveMessage, origin: string = recordbenchOrigin()): boolean {
  const page = window.open(origin + SAVE_PAGE, '_blank')
  if (!page) return false

  const stop = () => {
    window.removeEventListener('message', onMessage)
    window.clearTimeout(timer)
  }
  function onMessage(event: MessageEvent) {
    if (event.origin !== origin || event.source !== page) return
    const data = event.data as { type?: unknown } | null
    if (!data || data.type !== HANDOFF_READY) return
    page!.postMessage(message, origin)
    stop()
  }
  const timer = window.setTimeout(stop, WAIT_MS)
  window.addEventListener('message', onMessage)
  return true
}
