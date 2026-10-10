/**
 * Pointing at something on the page and saying what is wrong with it.
 *
 * This began as the Explorer's own widget (`explorer/model/point.ts`) and was dark there:
 * it drew only where a build named an address, and no build did. It is the whole app's
 * now, opened from the site bar, because the reader with something to report is as likely
 * to be looking at a results list as at a conversation.
 *
 * A note is not a message to the model and it does not join a conversation — a reader
 * telling us the trail is confusing is not a turn, and answering it with an answer would
 * be the wrong shape entirely. It goes to the people building this.
 *
 * Two places can receive one, and they read different shapes (`config.ts` says which this
 * build uses):
 *
 *   - **The worker's report route** (`POST /problem-reports`), the default. It was written
 *     for the connector's `report_problem` tool, so it speaks in `summary` / `observed` /
 *     `expected`; {@link reportFor} puts a reader's note into those words. It needs no
 *     credential, bounds itself per address, and answers a repeat with the report already
 *     on file.
 *   - **A capture route named at build time** (`VITE_POINT_URL`), which reads the note as
 *     it is. Recordbench's copy of this file is the same seam from a different framework
 *     (`frontend/src/lib/point.ts` there), and the wire contract they share is that
 *     route's own.
 */

import { tagHeaders, workerUrl } from '@lawfare/ragtime-client'

const QUOTE_LIMIT = 280
const PATH_DEPTH = 5
const SUMMARY_LIMIT = 200
const SUMMARY_LEAD = 'Site feedback: '

/** The words. Components interpolate them and type none of their own. */
export const POINT = {
  open: 'Feedback',
  title: 'Send feedback',
  close: 'Close',
  pick: 'Point at something',
  picking: 'Click the thing you mean, or press Escape',
  clear: 'Forget that element',
  placeholder: 'What is wrong, missing, or worth keeping?',
  reply: 'Email, if you want a reply (optional)',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Thank you. Your note was sent.',
  again: 'Send another',
  empty: 'Please write a few words first.',
  tooMany: 'Too many notes right now. Please try again in a few minutes.',
  unreachable: 'That could not be sent. Please try again.',
  nature: 'This goes to the people building RAGtime, not to the AI.',
  carries: 'Sent with your note: the address of this page, and what you pointed at.',
  aboutPage: 'About this page',
} as const

/**
 * A compact, best-effort CSS path: the nearest id, else each level tagged with
 * `:nth-of-type` where its siblings share a tag, five levels at most. An anchor that
 * stops resolving leaves a note about the page, which is what the feedback spine's own
 * model says an anchor does when it degrades.
 */
export function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node !== null && node.nodeType === 1 && parts.length < PATH_DEPTH) {
    const id = node.id ? escapeId(node.id) : null
    if (id !== null) {
      parts.unshift(`#${id}`)
      break
    }
    let part = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (parent !== null) {
      const tag = node.tagName
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === tag)
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

function escapeId(id: string): string | null {
  const escape = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS?.escape
  if (typeof escape === 'function') return escape(id)
  return /^[A-Za-z][\w-]*$/.test(id) ? id : null
}

/** What an element says, trimmed to what is worth storing beside the selector. */
export function quoteOf(el: Element): string {
  return (el.textContent ?? '').trim().slice(0, QUOTE_LIMIT)
}

/**
 * Which surface is talking. A capture route keeps one channel per surface and refuses a
 * name it does not know, so this is a closed pair rather than the route's own path: the
 * Explorer, which is the name that route already serves, and everything else.
 */
export function surfaceFor(pathname: string): string {
  return pathname === '/explorer' || pathname.startsWith('/explorer/') ? 'explorer' : 'ragtime'
}

/**
 * Query parameters that are a credential rather than a place. A magic-link sign-in comes
 * back to the app carrying one of these, and a note filed from that page would otherwise
 * hand it to whoever reads the note.
 */
const NOT_A_PLACE = ['code', 'token', 'token_hash', 'access_token', 'refresh_token', 'apikey', 'password']

/**
 * The address a note is about: the path and the query, and never the fragment. The query
 * stays because it is usually the search itself — `?q=habeas` is the difference between
 * "the results are wrong" and a report somebody can reproduce — and the fragment goes
 * because that is where a sign-in redirect puts its tokens. `feedback` goes too: it is
 * how the panel was opened, not where the reader is.
 */
export function pageAddress(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  for (const key of NOT_A_PLACE) params.delete(key)
  params.delete('feedback')
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/** One note, as a capture route reads it. */
export type PointNote = {
  surface: string
  body: string
  route: string
  selector: string
  quote: string
  email: string
}

export function noteFor(input: {
  surface: string
  body: string
  route: string
  selector: string | null
  quote: string | null
  email?: string | null
}): PointNote {
  return {
    surface: input.surface,
    body: input.body.trim(),
    route: input.route,
    selector: input.selector ?? '',
    quote: input.quote ?? '',
    email: (input.email ?? '').trim(),
  }
}

/** One note, as the worker's report route reads it. */
export type PointReport = {
  summary: string
  observed: string
  expected: string
  detail: string
  client: { name: string }
}

/**
 * The same note in the report route's words. That route was written for an agent filing
 * a defect, so it insists on what was observed *and* what was expected; a reader writes
 * one paragraph that is usually both, and making them split it is a form — the thing
 * pointing exists to avoid. So the paragraph is `observed`, whole, and `expected` says
 * plainly that nobody was asked. Everything about *where* goes in `detail`, one fact a
 * line, so the note itself reads as the reader wrote it.
 */
export function reportFor(note: PointNote): PointReport {
  const firstLine = note.body.split('\n')[0].replace(/\s+/g, ' ').trim()
  const where = [`Page: ${note.route}`, `Surface: ${note.surface}`]
  if (note.selector) where.push(`Pointed at: ${note.selector}`)
  if (note.quote) where.push(`It says: ${note.quote}`)
  if (note.email) where.push(`Reply to: ${note.email}`)
  return {
    summary: (SUMMARY_LEAD + firstLine).slice(0, SUMMARY_LIMIT),
    observed: note.body,
    expected: 'Not stated (sent from the site feedback form).',
    detail: where.join('\n'),
    client: { name: 'ragtime-web' },
  }
}

/** Which shape an address reads. */
export type PointWire = 'report' | 'note'

/** What came of one send. Four answers, and the panel says all four. */
export type PointOutcome = 'sent' | 'empty' | 'too_many' | 'unreachable'

/**
 * Post one note and say only what happened. Every failure that is not "too many" is one
 * failure: a reader cannot act on the difference between a refused origin, a dead network
 * and a 500, and a page explaining the difference would be apologising for its deployment.
 *
 * A repeat is a success. The report route answers the same words twice in a day with 200
 * and the report already on file, and a reader who pressed Send twice has been heard.
 */
export async function sendNote(
  endpoint: string,
  note: PointNote,
  wire: PointWire = 'note',
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<PointOutcome> {
  if (!note.body) return 'empty'
  try {
    // The tags go only to the worker: the console joins a report to the interaction it
    // came from by `x-rt-interaction`, and an external capture route (`VITE_POINT_URL`)
    // has not allowed the headers and would refuse the preflight.
    const tags = endpoint.startsWith(workerUrl()) ? tagHeaders() : {}
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { ...tags, 'content-type': 'application/json' },
      body: JSON.stringify(wire === 'report' ? reportFor(note) : note),
    })
    if (response.ok) return 'sent'
    return response.status === 429 ? 'too_many' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

/** The sentence for an outcome that is not success. */
export function outcomeSaid(outcome: Exclude<PointOutcome, 'sent'>): string {
  if (outcome === 'empty') return POINT.empty
  return outcome === 'too_many' ? POINT.tooMany : POINT.unreachable
}

/**
 * Whether this page was opened by a link that asks for the panel: `?feedback` with any
 * value but `0`. It is how a link in a message ("tell us here") lands a reader with the
 * panel already open instead of with directions to a button.
 */
export function feedbackRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('feedback')
  return value !== null && value !== '0'
}
