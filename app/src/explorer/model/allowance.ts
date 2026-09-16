/**
 * The daily allowance, which the page spends and never showed.
 *
 * Two limits sit under every turn and only one of them was on the screen. The conversation
 * cap (25¢) is in the `cost` event and the Meter renders it. The daily allowance is not:
 * the worker counts model calls per address per UTC day (`IP_DAILY_MODEL_CALLS`) and
 * refuses past it, so the first thing a member learned about the limit was being refused.
 *
 * Behind a mount that holds the credential, the address the worker counts is **the
 * mount's**, not the reader's. Everyone the gate admits therefore draws down one pool
 * between them, which is the opposite of what a page that says nothing implies. That is
 * the fact this module exists to put on the screen, and it is why the wording differs by
 * mount rather than being one sentence for both: on the page's own model the allowance is
 * the visitor's network, and telling them it is "shared" would be false.
 *
 * Pure, so `node --test` covers the wording; the component is thin over it.
 */

import type { ExplorerCostEvent } from '@lawfare/ragtime-client'

/** The refusals that mean an allowance ran out, as against a conversation reaching its cap. */
export const QUOTA_CODES: ReadonlySet<string> = new Set(['ip_quota', 'demo_quota'])

export type Allowance = {
  /** Calls charged against the pool today, or null when no turn has said yet. */
  used: number | null
  /** The pool. Live from the worker when it said, else what the page was built knowing. */
  cap: number
  /** Whether everyone behind the same gate draws on this one pool. */
  shared: boolean
  /** A refusal has said the pool is used up. */
  spent: boolean
  /** Whether `used` came from the worker rather than being unknown. */
  live: boolean
}

export type AllowanceInput = {
  /** The last `cost` event of the conversation, or null before the first turn. */
  cost: ExplorerCostEvent | null
  /** The allowance the page was built knowing; superseded by any `ip_cap` the worker sends. */
  fallbackCap: number
  shared: boolean
  /** The code of the refusal on screen, if any. */
  refusalCode?: string | null
}

export function allowance({ cost, fallbackCap, shared, refusalCode }: AllowanceInput): Allowance {
  const used = typeof cost?.ip_calls === 'number' ? cost.ip_calls : null
  const cap = typeof cost?.ip_cap === 'number' && cost.ip_cap > 0 ? cost.ip_cap : fallbackCap
  const spent = !!refusalCode && QUOTA_CODES.has(refusalCode)
  return { used, cap, shared, spent, live: used !== null }
}

/** How full the pool is, 0–100, or null when nothing has said. A spent pool reads full. */
export function allowancePercent(a: Allowance): number | null {
  if (a.spent) return 100
  if (a.used === null || a.cap <= 0) return null
  return Math.min(100, Math.round((100 * a.used) / a.cap))
}

/** The one line above the bar. */
export function allowanceLine(a: Allowance): string {
  if (a.spent) return shareWord(a) + ' allowance — used up for today'
  if (a.used === null) return shareWord(a) + ' allowance — ' + a.cap + ' model calls a day'
  return shareWord(a) + ' allowance — ' + a.used + ' of ' + a.cap + ' model calls today'
}

/**
 * What the line does not say on its own: who else is spending it, and when it comes back.
 * `conversationCalls` is what this page has watched itself spend, which is the only
 * honest number to give while the worker is not sending the pool's own count.
 */
export function allowanceNote(a: Allowance, conversationCalls: number): string {
  const resets = 'It resets at 00:00 UTC.'
  if (a.spent) {
    return a.shared
      ? 'Everyone with the access code draws on this one pool, and it is spent. ' + resets
      : 'This network has spent its allowance. ' + resets
  }
  const who = a.shared ? 'Everyone with the access code draws on this one pool.' : 'It covers this network, not this tab.'
  if (a.live) return who + ' ' + resets
  const mine = conversationCalls > 0 ? ' This conversation has spent ' + conversationCalls + '.' : ''
  return who + mine + ' ' + resets
}

/**
 * The refusal in words that are true where the reader is standing.
 *
 * The worker writes its quota refusal for the caller it usually has — a visitor on the
 * public site — and tells them to *sign in to continue*. Behind a mount that holds the
 * credential the reader is already through the mount's own gate, which is an access code
 * rather than an account, so there is no sign-in to do and it would change nothing if
 * there were: the allowance belongs to the mount, not to them. So the page, which is the
 * only party that knows which of the two it is, says it instead of passing the worker's
 * advice through.
 * Any other refusal is the worker's own words, unchanged.
 */
export function explainRefusal(code: string | null, message: string, shared: boolean): string {
  if (!shared || !code || !QUOTA_CODES.has(code)) return message
  return "Today's shared allowance is used up. Everyone with the access code draws on one pool of model calls; it resets at 00:00 UTC."
}

function shareWord(a: Allowance): string {
  return a.shared ? 'Shared' : 'Daily'
}
