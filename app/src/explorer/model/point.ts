/**
 * Pointing at something on the page and saying what is wrong with it.
 *
 * The Explorer sits behind a gate on a tenant that already runs a feedback spine,
 * so a note has somewhere honest to go: one POST to the tenant's capture route, filed
 * against the engagement's own feedback, triaged by a person. It is not a message to the
 * model and it does not join the conversation — a reader telling us the trail is confusing
 * is not a turn, and answering it with an answer would be the wrong shape entirely.
 *
 * The address is named at build time (`POINT_URL` in `config.ts`) and empty by default,
 * which is the page's own model: a page nobody mounted behind a gate has nowhere to send a
 * note and offers no way to write one. Recordbench's copy of this file is the same seam
 * from a different framework (`frontend/src/lib/point.ts` there); the wire contract they
 * share is the route's own docstring, `app/lawfare/api/feedback.py`.
 */

/** Which surface is talking. The capture route keeps one channel per surface. */
export const SURFACE = 'explorer'

const QUOTE_LIMIT = 280
const PATH_DEPTH = 5

/** The words. Components interpolate them and type none of their own. */
export const POINT = {
  open: 'Send feedback',
  title: 'Send feedback',
  close: 'Close',
  pick: 'Point at something',
  picking: 'Click the thing you mean, or press Escape',
  clear: 'Forget that element',
  placeholder: 'What is wrong, missing, or worth keeping?',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Thank you. Your note was sent.',
  again: 'Send another',
  empty: 'Please write a few words first.',
  tooMany: 'Too many notes right now. Please try again in a few minutes.',
  unreachable: 'That could not be sent. Please try again.',
  nature: 'This goes to the people building this, not to the model.',
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

/** One note, as the capture route reads it. */
export type PointNote = {
  surface: string
  body: string
  route: string
  selector: string
  quote: string
}

export function noteFor(input: {
  body: string
  route: string
  selector: string | null
  quote: string | null
}): PointNote {
  return {
    surface: SURFACE,
    body: input.body.trim(),
    route: input.route,
    selector: input.selector ?? '',
    quote: input.quote ?? '',
  }
}

/** What came of one send. Four answers, and the panel says all four. */
export type PointOutcome = 'sent' | 'empty' | 'too_many' | 'unreachable'

/**
 * Post one note and say only what happened. Every failure that is not "too many" is one
 * failure: a reader cannot act on the difference between a refused origin, a dead network
 * and a 500, and a page explaining the difference would be apologising for its deployment.
 */
export async function sendNote(
  endpoint: string,
  note: PointNote,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<PointOutcome> {
  if (!note.body) return 'empty'
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(note),
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
