/**
 * Sources connected to RAGtime that RAGtime does not hold (today only Google
 * Books). A brief names them in `connected`, beside its corpora but never among
 * them: the card shows them under "Connected to RAGtime", and a trail round that
 * read one carries the worker's `source` label and disclosure.
 *
 * The worker decides which are available (Google Books needs its key) and
 * refuses research on one it cannot read, so this table is only how the page
 * labels a slug; an unknown slug still shows, as itself.
 */

export type ConnectedSource = { name: string; note: string }

export const CONNECTED_SOURCES: Readonly<Record<string, ConnectedSource>> = {
  google_books: { name: 'Google Books', note: 'connected source, snippets only' },
}

export const CONNECTED_HEADING = 'Connected to RAGtime'

export function connectedName(slug: string): string {
  return CONNECTED_SOURCES[slug]?.name ?? slug
}

/** The chip's words: "Google Books — connected source, snippets only". */
export function connectedLabel(slug: string): string {
  const s = CONNECTED_SOURCES[slug]
  return s ? s.name + ' — ' + s.note : slug
}
