/**
 * The envelope a conversation carries, and what to do when the worker no longer takes it.
 *
 * Each turn's `done` hands back a signed envelope: the running spend, the phase, the brief
 * hash, signed by the worker and good for a day. The browser keeps it with the conversation
 * (`persist.ts`) and sends it back on the next turn — and keeps it for as long as the
 * conversation is kept, which is far longer than a day. So a tab left open overnight, or a
 * conversation reopened from the list a week later, sends an envelope the worker refuses:
 * HTTP 400, code `bad_envelope`, "Bad or expired envelope". A secret rotation on the worker
 * does the same to every envelope at once. Until this file existed, that line was shown to
 * the reader as the turn's answer (site feedback, 2026-10-08).
 *
 * The worker mints a fresh envelope for any turn that arrives without one, and the message
 * history travels in the request body either way. So a stale envelope costs nothing but the
 * spend meter, which starts again from zero: forget it and open the turn again bare. Nothing
 * else about the request changes. The refusal happens before the stream opens (the worker
 * answers with JSON, not events), so no event has been seen when the retry is decided and
 * nothing is shown twice.
 *
 * Only `bad_envelope` means this. A quota, a cap or a missing brief would be refused again
 * without the envelope and the reader should see them as they are. And a bare request that
 * is itself refused as `bad_envelope` is an error — there is nothing left to drop.
 */

import { ExplorerTurnError, type ExplorerEvent, type ExplorerTurnRequest } from '@lawfare/ragtime-client'

export const STALE_ENVELOPE = 'bad_envelope'

export type OpenTurn = (req: ExplorerTurnRequest) => AsyncIterable<ExplorerEvent>

export type OpenTurnOptions = {
  /** Called once if the kept envelope was refused and the turn went on without it. */
  onEnvelopeDropped?: () => void
}

/**
 * Open a turn through `open`; if the envelope it carries is refused as stale, open it once
 * more without one. Yields the events of whichever opening the worker accepted.
 */
export async function* openTurn(
  open: OpenTurn,
  req: ExplorerTurnRequest,
  opts: OpenTurnOptions = {},
): AsyncGenerator<ExplorerEvent, void, undefined> {
  // The refusal surfaces on the first `next()`: the fetch happens there, not when the
  // generator is made. Hold the first result so a retry can be decided before anything
  // is handed on.
  let it = open(req)[Symbol.asyncIterator]()
  let first: IteratorResult<ExplorerEvent, void>
  try {
    first = await it.next()
  } catch (err) {
    if (!(req.envelope && err instanceof ExplorerTurnError && err.code === STALE_ENVELOPE)) throw err
    opts.onEnvelopeDropped?.()
    it = open({ ...req, envelope: null })[Symbol.asyncIterator]()
    first = await it.next()
  }
  try {
    if (first.done) return
    yield first.value
    for (;;) {
      const r = await it.next()
      if (r.done) return
      yield r.value
    }
  } finally {
    // A consumer that stops early (the page aborted the turn) stops the stream too.
    await it.return?.()
  }
}
