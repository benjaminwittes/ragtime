import assert from 'node:assert/strict'
import { test } from 'vitest'

import { allowance, type Allowance } from './allowance.ts'
import { HOT_AT, attention } from './attention.ts'

function pool(patch: Partial<Allowance> = {}): Allowance {
  return { used: 10, cap: 60, shared: false, spent: false, live: true, ...patch }
}

test('at rest it says nothing but its own name', () => {
  assert.deepEqual(attention({ pool: pool({ used: 0 }) }), {
    label: 'Trail',
    short: 'Trail',
    hot: false,
  })
})

test('an ordinary day stays quiet', () => {
  // Half the allowance is not an emergency, and a control that goes hot here is a
  // control that is always hot — which is the strip this replaced.
  const a = attention({ pool: pool({ used: 30 }) })
  assert.equal(a.hot, false)
  assert.equal(a.label, 'Trail')
})

test('the threshold is the stated one, and it is inclusive', () => {
  const at = attention({ pool: pool({ used: (HOT_AT / 100) * 60 }) })
  assert.equal(at.hot, true)
  const just_under = attention({ pool: pool({ used: (HOT_AT / 100) * 60 - 1 }) })
  assert.equal(just_under.hot, false)
})

test('a filling daily allowance warns about later', () => {
  const a = attention({ pool: pool({ used: 54, cap: 60 }) })
  assert.equal(a.hot, true)
  assert.equal(a.label, '54 of 60 calls')
  assert.equal(a.short, '54/60')
})

test('a spent allowance says so', () => {
  const a = attention({ pool: pool({ spent: true }) })
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
    attention({ pool: pool({ used: 0 }) }),
    attention({ pool: pool({ used: 54, cap: 60 }) }),
    attention({ pool: pool({ spent: true }) }),
  ]
  for (const a of cases) {
    assert.ok(a.short.length <= 9, `${a.short} is ${a.short.length} characters, over budget`)
    assert.ok(a.short.length > 0)
  }
})

test('a paid reader has no pool, so nothing warns about one', () => {
  const a = attention({ pool: null })
  assert.equal(a.hot, false)
  assert.equal(a.label, 'Trail')
})

test('a pool the worker has not counted yet cannot be hot', () => {
  // `live: false` is the page not knowing, and an empty bar is not a measurement.
  const quiet = allowance({ cost: null, fallbackCap: 60, shared: false })
  const a = attention({ pool: quiet })
  assert.equal(a.hot, false)
})
