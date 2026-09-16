import { allowancePercent, type Allowance } from './allowance.ts'
import { cents } from './format.ts'

/**
 * What the trail control in the band says, and whether it asks to be looked at.
 *
 * This is the whole of the "uninvited" rule, in one place and testable, because it is a
 * product decision rather than a detail of the button: the page shows no numbers at rest,
 * and a reader who never opens the trail should still not be surprised by a limit. So the
 * control is silent until a limit is close, and then it carries the number that is close.
 *
 * Silence is the default and has to be earned back. The thresholds are deliberately high —
 * a control that goes hot at half the budget is a control that is always hot, which is the
 * strip this replaced.
 *
 * Precedence is by how hard the stop is. A spent daily allowance refuses the next turn
 * outright; a conversation at its cap ends this conversation but not the day; a filling
 * allowance is a warning about later. Reporting the softest of three would be the least
 * useful true thing to say.
 */
export const HOT_AT = 80

export type Attention = {
  /** What the control reads. */
  label: string
  /** Whether it is asking to be looked at. */
  hot: boolean
}

export type AttentionInput = {
  /** Spend so far in this conversation, in cents. */
  spendCents: number
  /** This conversation's cap, in cents. */
  capCents: number
  /**
   * The daily pool, or null for a reader who has none — a paid account is metered on its
   * balance, so it has no allowance to run out and nothing to warn it about.
   */
  pool: Allowance | null
}

export function attention({ spendCents, capCents, pool }: AttentionInput): Attention {
  if (pool?.spent) return { label: 'Allowance used up', hot: true }

  const spendPct = capCents > 0 ? (100 * spendCents) / capCents : 0
  if (spendPct >= HOT_AT) return { label: cents(spendCents) + ' of ' + capCents + '¢', hot: true }

  // A spent pool is already returned above, so `allowancePercent` is non-null here only
  // when the worker has actually said a count — which is what makes the label safe.
  const poolPct = pool ? allowancePercent(pool) : null
  if (pool && pool.used !== null && poolPct !== null && poolPct >= HOT_AT) {
    return { label: pool.used + ' of ' + pool.cap + ' calls', hot: true }
  }

  return { label: 'Trail', hot: false }
}
