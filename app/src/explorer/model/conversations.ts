/**
 * More than one conversation on the device.
 *
 * Persistence gave the reader back the conversation they were having. This gives them
 * back the ones they were having before — and it is the same problem underneath, because
 * the thing that used to destroy a conversation was not the page closing, it was pressing
 * "Start over". A research turn costs real money and lands a reader an answer they may
 * want to come back to; one tap threw it away with no confirmation and no recovery.
 *
 * **The blobs are the truth and the index is a cache.** Each conversation is written
 * under its own key, so saving the one being worked on does not rewrite the others — the
 * reason the draft got its own key already (`persist.ts`), scaled up. The index exists so
 * the list can be drawn without parsing every blob, and anything in it whose blob has
 * gone is dropped on read rather than trusted. That is the only drift possible in one
 * direction, and `reconcile` is where it is handled.
 *
 * **Eviction is by budget, not by age alone.** `localStorage` is about 5MB for the whole
 * origin and the Explorer is not the only thing in it; one conversation may take
 * `BUDGET_BYTES`. So the history has a budget of its own and a count limit, the oldest
 * go first, and the one open right now is never a candidate — evicting what the reader is
 * looking at would be the original bug with extra steps.
 *
 * Pure, like the rest of `model/`: no `window`, so every rule below is testable and the
 * hook does the I/O.
 */

import type { ExplorerBrief } from '@lawfare/ragtime-client'

import type { Saved } from './persist.ts'
import type { Turn } from './turn.ts'

/** Bumped when the index shape changes; an older index is dropped rather than migrated. */
export const INDEX_VERSION = 1

export const INDEX_KEY = 'ragtime_explorer_conversations_v1'

/**
 * A conversation's key is the old single-conversation key with its id after a colon.
 * The legacy key is therefore *not* matched by a prefix scan for `PREFIX + ':'`, which
 * is what lets `adopt` find it exactly once and then leave it alone.
 */
export const CONVERSATION_PREFIX = 'ragtime_explorer_conversation_v1'

export function conversationKey(cid: string): string {
  return CONVERSATION_PREFIX + ':' + cid
}

/** Everything the Explorer may keep on the device, across every conversation. */
export const HISTORY_BUDGET_BYTES = 3_000_000

/** And however much room there is, a list nobody can read is not worth keeping. */
export const MAX_CONVERSATIONS = 20

/** The longest a title may run before it is cut at a word. */
export const TITLE_MAX = 90

export type Summary = {
  cid: string
  title: string
  turns: number
  /** The conversation's own spend, in cents, as its last cost event reported it. */
  cents: number
  startedAt: number
  /**
   * When the conversation last *did* something — its newest turn's own clock.
   *
   * Not `savedAt`, which is when the blob was last written, and which merely opening the
   * page refreshes. Browsing your own history would otherwise stamp every conversation
   * you looked at with the present moment, and a list where everything says "just now"
   * has stopped telling the reader the one thing it was for.
   */
  workedAt: number
  /** When the blob was last written. What recency means to eviction, not to a reader. */
  savedAt: number
  /** What the blob takes, so the budget can be spent without reading them all. */
  bytes: number
}

export type Index = {
  v: number
  /** The conversation the page is on. Never evicted; may be absent on a first visit. */
  current: string | null
  /** Last worked on first — `byRecentWork`, which is the order a reader reads. */
  items: Summary[]
}

export const EMPTY_INDEX: Index = { v: INDEX_VERSION, current: null, items: [] }

/**
 * What to call a conversation in a list.
 *
 * The brief's goal when there is one — it is the sentence the conversation agreed it was
 * about, and it is better than the question that produced it. Before a brief exists, the
 * reader's own first question. Neither is a label anyone typed, so it is cut at a word
 * rather than mid-syllable, and a conversation with nothing in it says so plainly instead
 * of showing an empty row.
 */
export function titleOf(source: { brief: ExplorerBrief | null; turns: readonly Turn[] }): string {
  const raw = (source.brief?.goal ?? source.turns[0]?.prompt ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return 'Untitled conversation'
  if (raw.length <= TITLE_MAX) return raw
  const cut = raw.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return (space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}

/** The row the list draws for a conversation, from the blob that was just written. */
export function summarize(cid: string, saved: Saved, bytes: number, cents: number): Summary {
  const last = saved.turns[saved.turns.length - 1]
  const worked = last ? (last.endedAt ?? last.startedAt) : saved.savedAt
  return {
    cid,
    title: titleOf(saved),
    turns: saved.turns.length,
    cents,
    startedAt: saved.turns[0]?.startedAt ?? saved.savedAt,
    // A turn's clock comes off a blob this page wrote on some earlier version of itself,
    // so it is not guaranteed to be a date. Zero renders as 1970, which is a row that
    // looks broken rather than one that is merely old.
    workedAt: Number.isFinite(worked) && worked > 0 ? worked : saved.savedAt,
    savedAt: saved.savedAt,
    bytes,
  }
}

/** A summary in, the index out, newest first. Replaces the entry for the same id. */
export function upsert(index: Index, summary: Summary): Index {
  const items = index.items.filter((i) => i.cid !== summary.cid)
  items.push(summary)
  items.sort(byRecentWork)
  return { ...index, items }
}

export function remove(index: Index, cid: string): Index {
  return {
    ...index,
    current: index.current === cid ? null : index.current,
    items: index.items.filter((i) => i.cid !== cid),
  }
}

/**
 * The conversations to let go of, oldest first, until the history is inside its budget
 * and its count. `current` is never among them.
 *
 * Returned rather than applied, because dropping a conversation is a write to two places
 * — the blob and the index — and the hook owns both.
 */
export function evict(
  index: Index,
  budget: number = HISTORY_BUDGET_BYTES,
  max: number = MAX_CONVERSATIONS,
): { index: Index; drop: string[] } {
  const drop: string[] = []
  // Sorted here rather than trusted from `items`, which is newest first by convention.
  // A convention is not a guarantee, and the cost of it being wrong once is throwing away
  // the newest conversation instead of the oldest — silently, and with no way back.
  const candidates = index.items
    .filter((i) => i.cid !== index.current)
    .slice()
    .sort((a, b) => a.savedAt - b.savedAt)
  let total = index.items.reduce((n, i) => n + i.bytes, 0)
  let count = index.items.length
  for (const c of candidates) {
    if (total <= budget && count <= max) break
    drop.push(c.cid)
    total -= c.bytes
    count--
  }
  if (!drop.length) return { index, drop }
  return { index: { ...index, items: index.items.filter((i) => !drop.includes(i.cid)) }, drop }
}

/**
 * Drop whatever the index claims and the device does not have.
 *
 * The index is written after the blob, so a write interrupted between the two leaves an
 * entry pointing at nothing — and so does a browser evicting one key of an origin under
 * storage pressure. Either way the list must not offer a row that opens an empty page.
 */
export function reconcile(index: Index, has: (cid: string) => boolean): Index {
  const items = index.items.filter((i) => has(i.cid))
  if (items.length === index.items.length && (index.current === null || has(index.current))) return index
  return {
    v: index.v,
    current: index.current && has(index.current) ? index.current : null,
    items,
  }
}

/**
 * Read an index back, or start an empty one.
 *
 * Nothing throws, for the reason `restore` does not: a reader with a corrupt index still
 * has to get a page. Losing the index costs the *list*, not the conversations — the blobs
 * are still under their own keys, which is the other half of why the index is a cache.
 */
export function readIndex(raw: string | null): Index {
  if (!raw) return EMPTY_INDEX
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_INDEX
  }
  const i = parsed as Partial<Index> | null
  if (!i || typeof i !== 'object' || i.v !== INDEX_VERSION || !Array.isArray(i.items)) return EMPTY_INDEX
  const items = i.items.filter(
    (x): x is Summary =>
      !!x && typeof x === 'object' && typeof x.cid === 'string' && typeof x.savedAt === 'number',
  )
  return {
    v: INDEX_VERSION,
    current: typeof i.current === 'string' ? i.current : null,
    items: items.slice().sort(byRecentWork),
  }
}

/**
 * The order a reader sees: last worked on first, and the blob's own write time only to
 * break a tie between two that never ran a turn.
 */
function byRecentWork(a: Summary, b: Summary): number {
  return (b.workedAt ?? b.savedAt) - (a.workedAt ?? a.savedAt) || b.savedAt - a.savedAt
}

/** How a conversation's spend is read for the list: the last cost event that carried one. */
export function spendOf(turns: readonly Turn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    const costs = turns[i]!.costs
    const c = costs.length ? costs[costs.length - 1] : null
    if (c) return c.conversation_spend
  }
  return 0
}
