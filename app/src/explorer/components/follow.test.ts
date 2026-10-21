import { describe, expect, it } from 'vitest'

import { following, NEAR_END } from './follow.ts'

describe('following', () => {
  it('lets the reader go when they scroll up away from the end', () => {
    expect(following(true, { top: 400, lastTop: 900, fromEnd: 600 })).toBe(false)
  })

  it('keeps a reader at the end, whatever moved them', () => {
    expect(following(false, { top: 880, lastTop: 900, fromEnd: 0 })).toBe(true)
    expect(following(false, { top: 900, lastTop: 400, fromEnd: NEAR_END })).toBe(true)
  })

  it('does not take the page following the answer down for the reader leaving', () => {
    // The brush eases down a step at a time while the answer grows faster than it.
    expect(following(true, { top: 960, lastTop: 900, fromEnd: 300 })).toBe(true)
  })

  it('leaves a reader who scrolled away where they are while the page grows', () => {
    expect(following(false, { top: 400, lastTop: 400, fromEnd: 1200 })).toBe(false)
    expect(following(false, { top: 500, lastTop: 400, fromEnd: 1100 })).toBe(false)
  })

  it('ignores a sub-pixel jitter', () => {
    expect(following(true, { top: 899.5, lastTop: 900, fromEnd: 300 })).toBe(true)
  })
})
