import { cents } from '../model/format.ts'
import { conversationCost, type Turn } from '../model/turn.ts'

/**
 * The conversation meter (design item 6): what this conversation has spent, live.
 *
 * There is no cap to draw it against. The conversation cap (25¢, then $2) was removed on
 * 2026-09-28: it ended a presentation mid-demo, and the spend it guarded is better watched
 * than stopped. So this is a readout rather than a gauge. It moves on every `cost` event,
 * which the worker sends after each model round, so it climbs while a turn is running.
 *
 * One number, not four. It used to carry the phase, the step count, the model calls
 * and the turn count as well, across the top of the page where every reader paid for
 * them on every look. Three of those had another home already — the phase is a pill in
 * the app band, and the trail this now sits inside states each turn's cost and model
 * calls per turn — so they were four numbers answering a question the reader had not
 * asked. What is left is the one a reader watching the spend wants.
 */
export function Meter({ turns }: { turns: Turn[] }) {
  const last = conversationCost(turns)
  const spend = last ? last.conversation_spend : 0
  return (
    <div className="meter">
      {/* Named, because the number is the conversation's and not the day's: the daily
          allowance is a separate pool, and the Allowance line below shows it. */}
      <div className="meter-line">
        this conversation <b>{cents(spend)}</b>
      </div>
    </div>
  )
}
