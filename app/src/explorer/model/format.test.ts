/**
 * `ago` — how a conversation in the list says when it was last worked on.
 *
 * Pinned because the boundaries are where this reads wrong: "60 min ago" instead of an
 * hour, "1 days ago", and the point past which a count of days stops being useful and the
 * reader has to do arithmetic.
 */

import { describe, expect, it } from 'vitest'

import { ago } from './format.ts'

const NOW = Date.UTC(2026, 8, 16, 12, 0, 0)
const mins = (n: number) => NOW - n * 60_000
const hours = (n: number) => NOW - n * 3_600_000
const days = (n: number) => NOW - n * 86_400_000

describe('ago', () => {
  it('says nothing precise about the last minute', () => {
    expect(ago(NOW, NOW)).toBe('just now')
    expect(ago(mins(0.5), NOW)).toBe('just now')
    // A clock that disagrees with itself must not produce "-3 min ago".
    expect(ago(NOW + 5000, NOW)).toBe('just now')
  })

  it('counts minutes, then hours, at the boundary rather than past it', () => {
    expect(ago(mins(1), NOW)).toBe('1 min ago')
    expect(ago(mins(20), NOW)).toBe('20 mins ago')
    expect(ago(mins(59), NOW)).toBe('59 mins ago')
    expect(ago(mins(60), NOW)).toBe('1 hour ago')
    expect(ago(hours(23), NOW)).toBe('23 hours ago')
  })

  it('says yesterday rather than "1 days ago"', () => {
    expect(ago(days(1), NOW)).toBe('yesterday')
    expect(ago(days(2), NOW)).toBe('2 days ago')
    expect(ago(days(6), NOW)).toBe('6 days ago')
  })

  it('gives the date once counting days stops helping', () => {
    const out = ago(days(23), NOW)
    expect(out).not.toMatch(/ago|yesterday/)
    expect(out).toMatch(/\d/)
  })

  it('does not throw on a nonsense timestamp', () => {
    expect(ago(Number.NaN, NOW)).toBe('just now')
  })
})
