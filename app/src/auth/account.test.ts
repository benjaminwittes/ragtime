import { describe, expect, it } from 'vitest'

import { accountFrom, ownBalance } from './account.ts'

describe('accountFrom', () => {
  it('reads an ordinary account as billed to itself', () => {
    expect(accountFrom({ balance_cents: 900, per_query_cap_cents: 700, ledger: [], billing: 'self' })).toEqual({
      balance_cents: 900,
      per_query_cap_cents: 700,
      ledger: [],
      billing: 'self',
    })
  })

  it('takes an answer that does not say who pays to mean the balance', () => {
    // A Worker older than the field. The page has to behave as it always did.
    expect(accountFrom({ balance_cents: 900, per_query_cap_cents: 700 }).billing).toBe('self')
    expect(accountFrom({ billing: 'ORG' }).billing).toBe('self')
    expect(accountFrom({ billing: true }).billing).toBe('self')
  })

  it('reads an account on the organisation’s allowance, with the day’s count', () => {
    expect(
      accountFrom({ balance_cents: 0, per_query_cap_cents: 500, ledger: [], billing: 'org', allowance: { calls_today: 17, daily_quota: 5000 } }),
    ).toEqual({
      balance_cents: 0,
      per_query_cap_cents: 500,
      ledger: [],
      billing: 'org',
      allowance: { calls_today: 17, daily_quota: 5000 },
    })
  })

  it('keeps the allowance when the count is missing and drops it when the quota is', () => {
    expect(accountFrom({ billing: 'org', allowance: { calls_today: null, daily_quota: 5000 } }).allowance).toEqual({
      calls_today: null,
      daily_quota: 5000,
    })
    expect(accountFrom({ billing: 'org', allowance: { calls_today: 3 } })).not.toHaveProperty('allowance')
    expect(accountFrom({ billing: 'org', allowance: { calls_today: 3, daily_quota: 0 } })).not.toHaveProperty('allowance')
    expect(accountFrom({ billing: 'org' })).not.toHaveProperty('allowance')
  })

  it('shows no allowance on an account that is billed to itself, whatever was sent', () => {
    expect(accountFrom({ billing: 'self', allowance: { calls_today: 3, daily_quota: 5000 } })).not.toHaveProperty('allowance')
  })

  it('falls back to the page’s old defaults on a body it cannot read', () => {
    for (const odd of [null, undefined, 'nope', 4, []]) {
      expect(accountFrom(odd)).toEqual({ balance_cents: 0, per_query_cap_cents: 500, ledger: [], billing: 'self' })
    }
    // A per-query cap that is not a number (a staff account with no row yet sends null).
    expect(accountFrom({ per_query_cap_cents: null, billing: 'org' }).per_query_cap_cents).toBe(500)
  })
})

describe('ownBalance', () => {
  it('is the account when its own balance is what a query spends, and null when it is not', () => {
    const own = { balance_cents: 900, per_query_cap_cents: 500, billing: 'self' as const }
    const covered = { balance_cents: 0, per_query_cap_cents: 500, billing: 'org' as const }
    expect(ownBalance(own)).toBe(own)
    expect(ownBalance(covered)).toBeNull()
    expect(ownBalance(null)).toBeNull()
    // A snapshot from before the field existed is an ordinary account.
    const old = { balance_cents: 900, per_query_cap_cents: 500 }
    expect(ownBalance(old)).toBe(old)
  })
})
