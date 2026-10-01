/**
 * A signed-in account as the Worker's `GET /api/balance` describes it.
 *
 * `billing` says who pays for the account's AI calls. `'self'` is the prepaid balance, and
 * is what an answer that does not say is taken to mean: a Worker older than the field
 * knows no other way. `'org'` is the organisation's daily allowance, shared by everyone on
 * it; the balance is then a number nobody is drawing on, and a page that shows it beside a
 * "Top up" button is asking someone to pay for what is already paid for.
 */

export type PaidLedgerEntry = {
  at: string
  cost_cents: number
  /** Free-form label; what kind of call charged this. */
  kind?: string
}

/** The shared daily bucket an org-billed account draws on, as counted today. */
export type Allowance = {
  /** Calls made on the bucket today by everyone on it; null when the Worker could not count. */
  calls_today: number | null
  daily_quota: number
}

export type PaidAccount = {
  balance_cents: number
  per_query_cap_cents: number
  ledger?: readonly PaidLedgerEntry[]
  billing: 'self' | 'org'
  /** Present only when `billing` is `'org'` and the Worker sent a usable one. */
  allowance?: Allowance
}

function allowanceFrom(raw: unknown): Allowance | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { calls_today, daily_quota } = raw as { calls_today?: unknown; daily_quota?: unknown }
  if (typeof daily_quota !== 'number' || !Number.isFinite(daily_quota) || daily_quota <= 0) return undefined
  return {
    calls_today: typeof calls_today === 'number' && Number.isFinite(calls_today) ? calls_today : null,
    daily_quota,
  }
}

/** The account in a `/api/balance` body, with the defaults the page has always used. */
export function accountFrom(data: unknown): PaidAccount {
  const d = (typeof data === 'object' && data !== null ? data : {}) as {
    balance_cents?: unknown
    per_query_cap_cents?: unknown
    ledger?: unknown
    billing?: unknown
    allowance?: unknown
  }
  const billing = d.billing === 'org' ? 'org' : 'self'
  const allowance = billing === 'org' ? allowanceFrom(d.allowance) : undefined
  return {
    balance_cents: typeof d.balance_cents === 'number' ? d.balance_cents : 0,
    per_query_cap_cents: typeof d.per_query_cap_cents === 'number' ? d.per_query_cap_cents : 500,
    ledger: Array.isArray(d.ledger) ? (d.ledger as PaidLedgerEntry[]) : [],
    billing,
    ...(allowance ? { allowance } : {}),
  }
}

/** The account whose own balance is what a query would spend, or null when it is not. */
export function ownBalance<T extends { billing?: 'self' | 'org' }>(account: T | null): T | null {
  return account && account.billing !== 'org' ? account : null
}
