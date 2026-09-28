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
    steps: 2,
    step_cap: 8,
    ...patch,
  }
}

test('before any turn there is no pool to show — the page no longer guesses one', () => {
  assert.equal(allowance({ cost: null, shared: false }), null)
})

test("a demo caller's pool is the password's bucket, as the worker reports it", () => {
  const a = allowance({ cost: cost({ demo_calls: 412, demo_quota: 1500 }), shared: false })!
  assert.equal(a.kind, 'demo')
  assert.equal(a.used, 412)
  assert.equal(a.cap, 1500)
  assert.equal(a.live, true)
  assert.equal(allowancePercent(a), 27)
  assert.equal(allowanceLine(a), 'Demo code allowance — 412 of 1,500 model calls today')
})

test('a caller the worker reports no bucket for has no allowance at all', () => {
  // A paid account or an own key: the cost event carries neither pair, and reading a
  // missing count as 0 would put an empty bar on the screen and call it a measurement.
  assert.equal(allowance({ cost: cost(), shared: false }), null)
})

test('a worker from before 2026-09-28 still reads, as the network allowance it was', () => {
  const shared = allowance({ cost: cost({ ip_calls: 5, ip_cap: 60 }), shared: true })!
  const own = allowance({ cost: cost({ ip_calls: 5, ip_cap: 60 }), shared: false })!
  assert.equal(own.kind, 'network')
  assert.equal(allowanceLine(shared), 'Shared allowance — 5 of 60 model calls today')
  assert.match(allowanceLine(own), /^Daily allowance/)
})

test('the demo bucket wins when a worker sends both', () => {
  const a = allowance({ cost: cost({ demo_calls: 9, demo_quota: 1500, ip_calls: 50, ip_cap: 60 }), shared: false })!
  assert.equal(a.kind, 'demo')
  assert.equal(a.used, 9)
})

test('a quota refusal reads as spent, whichever bucket refused', () => {
  const demo = allowance({ cost: cost({ demo_calls: 1500, demo_quota: 1500 }), shared: false, refusalCode: 'demo_quota' })!
  assert.equal(demo.spent, true)
  assert.equal(allowancePercent(demo), 100)
  assert.equal(allowanceLine(demo), 'Demo code allowance — used up for today')
  // Refused before any cost event said which pool: the refusal alone is enough to show.
  const bare = allowance({ cost: null, shared: false, refusalCode: 'demo_quota' })!
  assert.equal(allowanceLine(bare), 'Demo code allowance — used up for today')
  const net = allowance({ cost: null, shared: true, refusalCode: 'ip_quota' })!
  assert.equal(allowanceLine(net), 'Shared allowance — used up for today')
})

test('a refusal that is not a quota is not the allowance running out', () => {
  assert.equal(allowance({ cost: cost(), shared: false, refusalCode: 'cap_cents' }), null)
})

test('the bar never runs past full', () => {
  const a = allowance({ cost: cost({ demo_calls: 1600, demo_quota: 1500 }), shared: false })!
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
  // And that neither retired limit is still promised (both removed 2026-09-28).
  assert.match(accessAndCostEntry.content, /does not cap a conversation/)
  assert.doesNotMatch(accessAndCostEntry.content, /25¢|sixty|network address/)
})
