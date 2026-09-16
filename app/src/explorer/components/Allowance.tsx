import { allowanceLine, allowanceNote, allowancePercent, type Allowance as AllowanceValue } from '../model/allowance.ts'

/**
 * The daily allowance, beside the conversation's own meter.
 *
 * The Meter answers "what is this conversation costing"; this answers "how much is there",
 * which is the question a member could not ask before. It sits above the trail rather than
 * inside Settings because a limit nobody knows about until it bites is a limit that is not
 * on the screen — and behind a gated mount the pool is shared, so one member's questions
 * are spending another's.
 */
export function Allowance({ value, conversationCalls }: { value: AllowanceValue; conversationCalls: number }) {
  const pct = allowancePercent(value)
  const hot = pct !== null && pct >= 80
  return (
    <div className={'allowance' + (value.spent ? ' spent' : '')}>
      <div className="allowance-line">{allowanceLine(value)}</div>
      {pct !== null && (
        <div className="bar" aria-hidden="true">
          <i style={{ width: pct + '%' }} className={hot ? 'hot' : ''} />
        </div>
      )}
      <div className="hint">{allowanceNote(value, conversationCalls)}</div>
    </div>
  )
}
