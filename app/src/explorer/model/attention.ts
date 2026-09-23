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
  /**
   * What it reads on a phone, where the row runs out.
   *
   * Measured at 390: the band gives this control somewhere between 74 and 85px before the
   * row wraps. "Trail" is 47px and "21¢ of 25¢" is 83px — one pixel of slack — while "54
   * of 60 calls" is 95px and "Allowance used up" is 126px, which pushed two other controls
   * down a row. So the two labels that only appear when a limit is close were the two that
   * did not fit, which is the worst possible place to spend the reader's screen.
   *
   * Every wording here was measured in the real button rather than counted: "No calls
   * left" is thirteen characters and 87px, and wrapped the row exactly as the long form
   * did. What is written below fits with room.
   *
   * The band already abbreviates twice below `sm` for exactly this reason ("AI access" →
   * "Access", "? Docs" → "?"), so this is the same move a third time rather than a new
   * idea. The full wording is what a reader sees wherever there is room for it.
   */
  short: string
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

/** `cents` writes the unit, and the short forms carry it once at the end instead. */
function bare(n: number): string {
  const c = cents(n)
  return c.endsWith('¢') ? c.slice(0, -1) : c
}

export function attention({ spendCents, capCents, pool }: AttentionInput): Attention {
  // "Used up" rather than a count: a refusal is what says the pool is spent, and the cap
  // it is spent against is not always the one the last cost event reported — a demo
  // allowance refuses on its own number. The tail of the full wording asserts nothing that
  // could be wrong, and a reader who has seen either wording recognises the other.
  if (pool?.spent) return { label: 'Allowance used up', short: 'Used up', hot: true }

  const spendPct = capCents > 0 ? (100 * spendCents) / capCents : 0
  if (spendPct >= HOT_AT) {
    return {
      label: cents(spendCents) + ' of ' + capCents + '¢',
      short: bare(spendCents) + '/' + capCents + '¢',
      hot: true,
    }
  }

  // A spent pool is already returned above, so `allowancePercent` is non-null here only
  // when the worker has actually said a count — which is what makes the label safe.
  const poolPct = pool ? allowancePercent(pool) : null
  if (pool && pool.used !== null && poolPct !== null && poolPct >= HOT_AT) {
    return {
      label: pool.used + ' of ' + pool.cap + ' calls',
      // The word "calls" is what makes this long, and it is the word a reader on a phone
      // can spare: the control it is written on is the one that opens the trail, where
      // the same number is spelled out in full.
      short: pool.used + '/' + pool.cap,
      hot: true,
    }
  }

  return { label: 'Trail', short: 'Trail', hot: false }
}
