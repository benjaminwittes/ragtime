/**
 * The daily allowance, which the page spends and never showed.
 *
 * With no conversation cap (removed 2026-09-28) the one limit a caller can meet is a daily
 * count of model calls, and a limit nobody sees until it refuses is the flaw this module
 * exists to fix. Which count it is depends on the worker:
 *
 * - **The demo password's bucket** (`demo_calls` / `demo_quota`), from 2026-09-28. Every
 *   caller using the same password draws on it, wherever they are.
 * - **The network's allowance** (`ip_calls` / `ip_cap`), from a worker before then: 60
 *   calls per address per day, shared by everyone on one network. Read only so the page is
 *   right against either worker while the two deploy.
 *
 * A caller the worker reports no bucket for — a paid account, an own key — has no
 * allowance at all, and the page shows none rather than a number it was built knowing.
 *
 * Pure, so `node --test` covers the wording; the component is thin over it.
 */

import type { ExplorerCostEvent } from '@lawfare/ragtime-client'

/** The refusals that mean an allowance ran out, as against any other refusal. */
export const QUOTA_CODES: ReadonlySet<string> = new Set(['ip_quota', 'demo_quota'])

export type Allowance = {
  /** Calls charged against the pool today, or null when no turn has said yet. */
  used: number | null
  /** The pool, as the worker reported it; 0 when only a refusal has spoken. */
  cap: number
  /** Whose pool: the demo password's, or (an older worker) the network's. */
  kind: 'demo' | 'network'
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
  shared: boolean
  /** The code of the refusal on screen, if any. */
  refusalCode?: string | null
}

/** The pool this caller draws on, or null when the worker has reported none. */
export function allowance({ cost, shared, refusalCode }: AllowanceInput): Allowance | null {
  const spent = !!refusalCode && QUOTA_CODES.has(refusalCode)
  if (typeof cost?.demo_quota === 'number' && cost.demo_quota > 0) {
    const used = typeof cost.demo_calls === 'number' ? cost.demo_calls : null
    return { used, cap: cost.demo_quota, kind: 'demo', shared, spent, live: used !== null }
  }
  if (typeof cost?.ip_cap === 'number' && cost.ip_cap > 0) {
    const used = typeof cost.ip_calls === 'number' ? cost.ip_calls : null
    return { used, cap: cost.ip_cap, kind: 'network', shared, spent, live: used !== null }
  }
  if (spent) {
    return { used: null, cap: 0, kind: refusalCode === 'ip_quota' ? 'network' : 'demo', shared, spent, live: false }
  }
  return null
}

/** How full the pool is, 0–100, or null when nothing has said. A spent pool reads full. */
export function allowancePercent(a: Allowance): number | null {
  if (a.spent) return 100
  if (a.used === null || a.cap <= 0) return null
  return Math.min(100, Math.round((100 * a.used) / a.cap))
}

/** `1,500` — the demo bucket runs to four digits, which read badly bare. */
export function calls(n: number): string {
  return n.toLocaleString('en-US')
}

/** The one line above the bar. */
export function allowanceLine(a: Allowance): string {
  if (a.spent) return poolWord(a) + ' — used up for today'
  if (a.used === null) return poolWord(a) + ' — ' + calls(a.cap) + ' model calls a day'
  return poolWord(a) + ' — ' + calls(a.used) + ' of ' + calls(a.cap) + ' model calls today'
}

/*
 * `allowanceNote` used to live here: two sentences under the line saying who else draws
 * on the pool and when it resets. It was documentation rather than a readout, and it was
 * printed on every page view to say something that does not change. It is now a section
 * of the "Access & Cost" docs entry, reachable from the same band as the trail. The
 * refusal path did not depend on it — `explainRefusal` below carries the reset time in
 * the words the reader needs at the moment a turn is actually refused.
 */

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

function poolWord(a: Allowance): string {
  if (a.kind === 'demo') return 'Demo code allowance'
  return (a.shared ? 'Shared' : 'Daily') + ' allowance'
}
