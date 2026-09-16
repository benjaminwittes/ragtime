import { allowanceLine, allowancePercent, type Allowance as AllowanceValue } from '../model/allowance.ts'

/**
 * The daily allowance, beside the conversation's own meter, inside the trail.
 *
 * The Meter answers "what is this conversation costing"; this answers "how much is
 * there". Both used to sit across the top of the page, on the argument that a limit
 * nobody knows about until it bites is a limit that is not on the screen. Measured on a
 * phone that argument cost about 250px of 844 before a reader had asked anything — so
 * the limit is now on the screen at the two moments it means something: when it is
 * close (the trail control in the band carries the number and turns), and when it
 * refuses (the turn's own error block, in `explainRefusal`'s words). The rest of the
 * time it is one line behind one tap.
 *
 * What went with it: the two-sentence note about who else draws on the pool and when it
 * resets. That is documentation rather than a readout, and it now lives in the
 * "Access & Cost" docs entry, which is reachable from the same band.
 */
export function Allowance({ value }: { value: AllowanceValue }) {
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
    </div>
  )
}
