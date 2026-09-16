import { cents } from '../model/format.ts'
import { conversationCost, type Turn } from '../model/turn.ts'

/** The conversation meter (design item 6): spend against the cap, steps, model calls, turns. */
export function Meter({ turns, phase, totalCalls }: { turns: Turn[]; phase: string; totalCalls: number }) {
  const last = conversationCost(turns)
  const spend = last ? last.conversation_spend : 0
  const cap = last ? last.cap_cents : 25
  const pct = Math.min(100, (100 * spend) / cap)
  return (
    <div className="meter">
      <div className="meter-line">
        <span className="pill">{phase}</span>
        {/* Named, because the number beside it is the conversation's and not the day's:
            the daily allowance is a separate pool, and the Allowance panel shows it. */}
        <span>
          this conversation <b>{cents(spend)}</b> of <b>{cap}¢</b>
        </span>
        {last && (
          <span>
            steps{' '}
            <b>
              {last.steps}/{last.step_cap}
            </b>
          </span>
        )}
        <span>
          model calls <b>{totalCalls}</b>
        </span>
        <span>
          turns <b>{turns.filter((t) => !t.running).length}</b>
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: pct + '%' }} className={pct >= 90 ? 'hot' : ''} />
      </div>
    </div>
  )
}
