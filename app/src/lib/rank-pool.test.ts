import { describe, expect, it } from 'vitest'

import { rankPoolLine } from './rank-pool'

describe('rankPoolLine', () => {
  it('speaks when the search matched more than the worker ranked', () => {
    // "soviet" on FRUS: 55,159 matches, the newest 10,000 ranked.
    expect(rankPoolLine(55159, 10000)).toBe(
      'Best matches among the newest 10,000 only. Narrow the dates to reach earlier years.',
    )
  })

  it('says nothing when every match was ranked', () => {
    expect(rankPoolLine(16, 10000)).toBeNull()
    expect(rankPoolLine(10000, 10000)).toBeNull()
  })

  it('says nothing for a browse, or against a worker without the field', () => {
    expect(rankPoolLine(314483, null)).toBeNull()
    expect(rankPoolLine(314483, undefined)).toBeNull()
    expect(rankPoolLine(undefined, 10000)).toBeNull()
  })
})
