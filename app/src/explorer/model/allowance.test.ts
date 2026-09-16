import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { ExplorerCostEvent } from '@lawfare/ragtime-client'

import { accessAndCostEntry } from '@/docs/content/access-and-cost'
import { allowance, allowanceLine, allowancePercent, explainRefusal } from './allowance.ts'

function cost(patch: Partial<ExplorerCostEvent> = {}): ExplorerCostEvent {
  return {
    type: 'cost',
    turn_cents: 4.4,
    conversation_cents: 6,
    conversation_spend: 5.3,
    cap_cents: 25,
    steps: 2,
    step_cap: 8,
    ...patch,
  }
}

test('before any turn the pool is the number the page was built knowing', () => {
  const a = allowance({ cost: null, fallbackCap: 60, shared: true })
  assert.equal(a.cap, 60)
  assert.equal(a.used, null)
  assert.equal(a.live, false)
  assert.equal(allowancePercent(a), null)
  assert.equal(allowanceLine(a), 'Shared allowance — 60 model calls a day')
})

test('a worker that reports the day supersedes the built-in number', () => {
  const a = allowance({ cost: cost({ ip_calls: 23, ip_cap: 80 }), fallbackCap: 60, shared: true })
  assert.equal(a.used, 23)
  assert.equal(a.cap, 80)
  assert.equal(a.live, true)
  assert.equal(allowancePercent(a), 29)
  assert.equal(allowanceLine(a), 'Shared allowance — 23 of 80 model calls today')
})

test('a worker deployed before the fields says nothing rather than zero', () => {
  // The old `cost` event carries neither field; reading a missing count as 0 would put an
  // empty bar on the screen and call it a measurement.
  const a = allowance({ cost: cost(), fallbackCap: 60, shared: true })
  assert.equal(a.used, null)
  assert.equal(a.live, false)
  assert.equal(allowancePercent(a), null)
})

test('behind a gate the pool is shared; on the page own model it is the network', () => {
  const shared = allowance({ cost: cost({ ip_calls: 5, ip_cap: 60 }), fallbackCap: 60, shared: true })
  const own = allowance({ cost: cost({ ip_calls: 5, ip_cap: 60 }), fallbackCap: 60, shared: false })
  assert.match(allowanceLine(shared), /^Shared allowance/)
  assert.match(allowanceLine(own), /^Daily allowance/)
})

test('a quota refusal reads as spent, whichever bucket refused', () => {
  for (const code of ['ip_quota', 'demo_quota']) {
    const a = allowance({ cost: cost({ ip_calls: 60, ip_cap: 60 }), fallbackCap: 60, shared: true, refusalCode: code })
    assert.equal(a.spent, true)
    assert.equal(allowancePercent(a), 100)
    assert.equal(allowanceLine(a), 'Shared allowance — used up for today')
  }
})

test('a conversation reaching its own cap is not the allowance running out', () => {
  // Two different limits: `cap_cents` is this conversation's 25¢, and the Meter shows it.
  const a = allowance({ cost: cost(), fallbackCap: 60, shared: true, refusalCode: 'cap_cents' })
  assert.equal(a.spent, false)
})

test('the bar never runs past full', () => {
  const a = allowance({ cost: cost({ ip_calls: 75, ip_cap: 60 }), fallbackCap: 60, shared: true })
  assert.equal(allowancePercent(a), 100)
})

const WORKER_QUOTA_REFUSAL =
  'Daily Explorer allowance for this network reached (60 model calls). Sign in to continue, or try again tomorrow.'

test('behind a gate a quota refusal stops telling a reader already through it to sign in', () => {
  const shown = explainRefusal('ip_quota', WORKER_QUOTA_REFUSAL, true)
  assert.doesNotMatch(shown, /[Ss]ign in to continue/)
  assert.match(shown, /shared allowance is used up/)
  assert.match(shown, /00:00 UTC/)
})

test('on the page own model the worker keeps its words — signing in is real advice there', () => {
  assert.equal(explainRefusal('ip_quota', WORKER_QUOTA_REFUSAL, false), WORKER_QUOTA_REFUSAL)
})

test('any refusal that is not a quota passes through untouched', () => {
  for (const code of ['cap_cents', 'bad_envelope', 'network', null]) {
    assert.equal(explainRefusal(code, 'the worker said this', true), 'the worker said this')
  }
})

/**
 * This used to assert that every rendered allowance note said when the pool comes back.
 * The note is gone from the screen, but the invariant is not: a reader still has to be
 * able to find out. It survives in two places, and this pins both, because a promise
 * moved into prose is the kind that rots without anything going red.
 */
test('a reader can still find out when the pool comes back', () => {
  // At the moment it refuses, in the words the refusal itself carries.
  assert.match(explainRefusal('ip_quota', 'anything', true), /00:00 UTC/)
  // And at any other moment, in the docs entry the prose moved to.
  assert.match(accessAndCostEntry.content, /00:00 UTC/)
  assert.match(accessAndCostEntry.content, /daily allowance/i)
  assert.match(accessAndCostEntry.content, /25¢/)
})
