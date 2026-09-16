import assert from 'node:assert/strict'
import { test } from 'vitest'

import { allowance, type Allowance } from './allowance.ts'
import { HOT_AT, attention } from './attention.ts'

function pool(patch: Partial<Allowance> = {}): Allowance {
  return { used: 10, cap: 60, shared: false, spent: false, live: true, ...patch }
}

test('at rest it says nothing but its own name', () => {
  assert.deepEqual(attention({ spendCents: 0, capCents: 25, pool: pool({ used: 0 }) }), {
    label: 'Trail',
    short: 'Trail',
    hot: false,
  })
})

test('an ordinary conversation stays quiet', () => {
  // Two thirds of the cap is not an emergency, and a control that goes hot here is a
  // control that is always hot — which is the strip this replaced.
  const a = attention({ spendCents: 16, capCents: 25, pool: pool({ used: 30 }) })
  assert.equal(a.hot, false)
  assert.equal(a.label, 'Trail')
})

test('near the conversation cap it carries the number that is near', () => {
  const a = attention({ spendCents: 21, capCents: 25, pool: pool() })
  assert.equal(a.hot, true)
  assert.equal(a.label, '21¢ of 25¢')
  assert.equal(a.short, '21/25¢')
})

test('the threshold is the stated one, and it is inclusive', () => {
  const at = attention({ spendCents: (HOT_AT / 100) * 25, capCents: 25, pool: pool() })
  assert.equal(at.hot, true)
  const just_under = attention({ spendCents: (HOT_AT / 100) * 25 - 0.5, capCents: 25, pool: pool() })
  assert.equal(just_under.hot, false)
})

test('a filling daily allowance warns about later', () => {
  const a = attention({ spendCents: 1, capCents: 25, pool: pool({ used: 54, cap: 60 }) })
  assert.equal(a.hot, true)
  assert.equal(a.label, '54 of 60 calls')
  assert.equal(a.short, '54/60')
})

test('a spent allowance outranks a conversation near its cap', () => {
  // Both are true at once here. The spent pool refuses the next turn outright; the cap
  // ends only this conversation. Reporting the softer of the two would be the least
  // useful true thing to say.
  const a = attention({ spendCents: 24, capCents: 25, pool: pool({ spent: true }) })
  assert.equal(a.label, 'Allowance used up')
  assert.equal(a.short, 'Used up')
})

test('every label a phone can be shown fits the row it has to fit', () => {
  // The band gives this control between 74 and 85px at 390 before the row wraps, measured
  // in Chrome by widening the label until it did (see `Attention.short`). The longest of
  // these is "Used up" at 67px. The character count is a proxy standing in for that
  // measurement so a lengthened string fails here rather than on somebody's phone — and it
  // is deliberately tighter than it needs to be, because the proxy is the weak part: "No
  // calls left" is 13 characters and 87px, and was written and measured before this said 9.
  const cases = [
    attention({ spendCents: 0, capCents: 25, pool: pool({ used: 0 }) }),
    attention({ spendCents: 21, capCents: 25, pool: pool() }),
    attention({ spendCents: 1, capCents: 25, pool: pool({ used: 54, cap: 60 }) }),
    attention({ spendCents: 24, capCents: 25, pool: pool({ spent: true }) }),
  ]
  for (const a of cases) {
    assert.ok(a.short.length <= 9, `${a.short} is ${a.short.length} characters, over budget`)
    assert.ok(a.short.length > 0)
  }
})

test('a paid reader has no pool, so nothing warns about one', () => {
  const a = attention({ spendCents: 1, capCents: 25, pool: null })
  assert.equal(a.hot, false)
  assert.equal(a.label, 'Trail')
})

test('a pool the worker has not counted yet cannot be hot', () => {
  // `live: false` is the page not knowing, and an empty bar is not a measurement.
  const quiet = allowance({ cost: null, fallbackCap: 60, shared: false })
  const a = attention({ spendCents: 1, capCents: 25, pool: quiet })
  assert.equal(a.hot, false)
})

test('a cap of zero does not divide by it', () => {
  const a = attention({ spendCents: 5, capCents: 0, pool: pool({ used: 0 }) })
  assert.equal(a.hot, false)
})
