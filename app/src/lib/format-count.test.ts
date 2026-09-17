/**
 * The hub's counts, as they are actually rendered today, plus the two edges.
 *
 * The first block is the eleven corpora — the figures the spokes reported when
 * the rounding was ruled — because the point of the change is what those eleven
 * lines say, and a regression in the rounding would show up here as a line of
 * the hub reading wrong.
 */

import { describe, expect, it } from 'vitest'
import { formatCount } from './format-count'

describe('formatCount, on the eleven corpora', () => {
  it('reads millions to one decimal', () => {
    expect(formatCount(1_737_246)).toBe('1.7M')
    expect(formatCount(1_182_281)).toBe('1.2M')
  })

  it('reads hundreds of thousands to the nearest ten thousand', () => {
    expect(formatCount(809_230)).toBe('810K')
    expect(formatCount(313_876)).toBe('310K')
    expect(formatCount(227_843)).toBe('230K')
  })

  it('reads tens of thousands to the nearest thousand', () => {
    expect(formatCount(60_417)).toBe('60K')
    expect(formatCount(23_541)).toBe('24K')
    expect(formatCount(19_913)).toBe('20K')
    expect(formatCount(12_726)).toBe('13K')
    expect(formatCount(10_746)).toBe('11K')
  })

  it('leaves a countable corpus exact', () => {
    expect(formatCount(2_151)).toBe('2,151')
  })
})

describe('formatCount, at the edges', () => {
  it('rounds from 10,000 and not before', () => {
    expect(formatCount(9_999)).toBe('9,999')
    expect(formatCount(10_000)).toBe('10K')
    expect(formatCount(0)).toBe('0')
  })

  // Two significant figures of 999.95 thousand is 1000, which has outgrown the
  // unit it is written in. The carry sends it to the next one, and the trailing
  // `.0` goes as it does everywhere else, so the answer is `1M` rather than
  // `1.0M` — and the K figure that precedes it is `990K`.
  it('carries a thousand thousands into a million', () => {
    expect(formatCount(994_999)).toBe('990K')
    expect(formatCount(995_000)).toBe('1M')
    expect(formatCount(999_950)).toBe('1M')
    expect(formatCount(999_999)).toBe('1M')
    expect(formatCount(1_000_000)).toBe('1M')
  })

  it('never writes a count of four digits in thousands', () => {
    for (let n = 900_000; n <= 1_100_000; n += 137) {
      expect(formatCount(n)).not.toMatch(/^\d{4,}K$/)
    }
  })

  // The same carry at the top of the millions needs no code of its own: two
  // significant figures of 9.999999 is 10, and 10 prints as a whole number.
  it('carries at the top of the millions too', () => {
    expect(formatCount(9_999_999)).toBe('10M')
  })
})
