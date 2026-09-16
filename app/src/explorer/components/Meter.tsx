import { cents } from '../model/format.ts'
import { conversationCost, type Turn } from '../model/turn.ts'

/**
 * The conversation meter (design item 6): spend against the cap.
 *
 * One number, not four. It used to carry the phase, the step count, the model calls
 * and the turn count as well, across the top of the page where every reader paid for
 * them on every look. Three of those had another home already — the phase is a pill in
 * the app band, and the trail this now sits inside states each turn's cost and model
 * calls per turn — so they were four numbers answering a question the reader had not
 * asked. What is left is the one a spending limit actually turns on.
 */
export function Meter({ turns }: { turns: Turn[] }) {
  const last = conversationCost(turns)
  const spend = last ? last.conversation_spend : 0
  const cap = last ? last.cap_cents : 25
  const pct = Math.min(100, (100 * spend) / cap)
  return (
    <div className="meter">
      {/* Named, because the number is the conversation's and not the day's: the daily
          allowance is a separate pool, and the Allowance line below shows it. */}
      <div className="meter-line">
        this conversation <b>{cents(spend)}</b> of <b>{cap}¢</b>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: pct + '%' }} className={pct >= 90 ? 'hot' : ''} />
      </div>
    </div>
  )
}
