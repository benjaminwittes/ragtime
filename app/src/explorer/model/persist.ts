/**
 * The conversation, kept on the device.
 *
 * Leaving the page used to lose everything: the turns, the accepted brief, the pins, and
 * whatever was half-typed. On a laptop that is an annoyance; on a phone it is the ordinary
 * case, because a background tab is discarded whenever the system wants the memory, and
 * the reader did nothing to cause it.
 *
 * **What has to be saved is not what is on the screen.** The turns are the *record* of the
 * conversation; `messages` and `envelope` are the conversation itself, as the worker
 * continues it (`continueFrom`). Restoring only the turns would give a page that looks
 * unbroken and whose next follow-up silently starts from nothing — worse than losing it
 * visibly, because nothing would say so.
 *
 * Pure, like the rest of `model/`: no React and no `window`, so the rules below are
 * testable and the hook does the I/O.
 */

import type { ExplorerBrief, ExplorerMessage } from '@lawfare/ragtime-client'

import type { Turn } from './turn.ts'

/** Bumped when the shape changes; an older blob is dropped rather than migrated. */
export const PERSIST_VERSION = 1

export const STORAGE_KEY = 'ragtime_explorer_conversation_v1'
/**
 * The draft is its own key, and deliberately so: it changes on every keystroke, and the
 * conversation does not. One key would mean rewriting every turn and the whole message
 * history to record one typed character.
 */
export const DRAFT_KEY = 'ragtime_explorer_draft_v1'

/**
 * What one conversation may take. localStorage is about 5MB for the whole origin and this
 * is not the only thing in it — the usage log, the access settings and the demo password
 * live there too, and a write that throws `QuotaExceededError` would take them down with
 * it rather than merely failing to save a turn.
 */
export const BUDGET_BYTES = 1_000_000

export type Saved = {
  v: number
  turns: Turn[]
  brief: ExplorerBrief | null
  proposed: ExplorerBrief | null
  pinned: string[]
  messages: ExplorerMessage[]
  envelope: string | null
  savedAt: number
}

/**
 * A turn that was still running when the page went away.
 *
 * It cannot be resumed — the stream is gone, and the worker has already done and charged
 * for whatever it did. So it is closed out as interrupted rather than restored as running,
 * which would leave a spinner turning forever over a request nobody is making. The same
 * treatment `run()` gives a stream that ends early, with a code that says which of the two
 * happened, because "the page closed" and "the stream broke" are different things to a
 * reader deciding whether to ask again.
 */
export function settle(t: Turn, now: number): Turn {
  if (!t.running) return t
  return {
    ...t,
    running: false,
    endedAt: t.endedAt ?? now,
    stop: t.stop ?? 'error',
    // `buffer` is text not yet flushed to narration or the answer, and `lastEvent` is
    // "what is happening right now" — neither means anything once nothing is happening.
    buffer: '',
    lastEvent: null,
    error: t.error ?? {
      type: 'error',
      code: 'interrupted',
      message: 'This turn was interrupted when the page closed. What it spent is in the trail.',
      retryable: true,
    },
  }
}

/**
 * The blob to write, trimmed to fit.
 *
 * Over budget, the oldest turns are dropped and `messages` is kept whole — so the model
 * still remembers what the reader can no longer scroll back to. That asymmetry is
 * deliberate: truncating `messages` to match would silently change what the next turn is
 * answering, and a short history is a visible loss where a mutilated continuation is an
 * invisible one. The newest turn is never dropped; if even that will not fit, nothing is
 * written, because a blob that cannot hold one turn cannot hold a conversation.
 */
export function pack(s: Saved): string | null {
  return fit(s)?.raw ?? null
}

/**
 * The same trim, with the trimmed conversation handed back alongside its bytes.
 *
 * The conversation list summarises what a reader will actually get back — a turn count
 * and a spend — and `pack` alone cannot tell it, because the turns it dropped are gone by
 * the time it returns a string. Reading them back out of the string would mean parsing a
 * megabyte on every save; this is the same loop, returning what it already knows.
 */
export function fit(s: Saved): { saved: Saved; raw: string } | null {
  let turns = s.turns
  for (;;) {
    const saved = { ...s, turns }
    const raw = JSON.stringify(saved)
    if (raw.length <= BUDGET_BYTES) return { saved, raw }
    if (turns.length <= 1) return null
    turns = turns.slice(1)
  }
}

/**
 * Read a blob back, or nothing.
 *
 * Nothing throws. A missing key is the ordinary first visit; a corrupt or older one is a
 * reader whose page must still open. The checks are shallow on purpose — this validates
 * that the shape is ours, not that every field is well-formed, because the alternative is
 * a schema validator for data this page itself wrote.
 */
export function restore(raw: string | null, now: number): Saved | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const s = parsed as Partial<Saved> | null
  if (!s || typeof s !== 'object') return null
  if (s.v !== PERSIST_VERSION) return null
  if (!Array.isArray(s.turns) || !Array.isArray(s.messages) || !Array.isArray(s.pinned)) return null
  return {
    v: PERSIST_VERSION,
    turns: s.turns.map((t) => settle(t, now)),
    brief: s.brief ?? null,
    proposed: s.proposed ?? null,
    pinned: s.pinned.filter((p): p is string => typeof p === 'string'),
    messages: s.messages,
    envelope: typeof s.envelope === 'string' ? s.envelope : null,
    savedAt: typeof s.savedAt === 'number' ? s.savedAt : now,
  }
}
