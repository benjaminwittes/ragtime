import { describe, it, expect } from 'vitest'

import { dayOf, type StageDoc } from './record'
import { APART, REACH, clip, draw, ground, outline, shadow, type Pt, type Seed } from './terrain'

function doc(over: Partial<StageDoc> = {}): StageDoc {
  return {
    id: 'a',
    title: 'A document',
    line: null,
    number: null,
    at: dayOf('2001-09-18'),
    when: '2001-09-18',
    chars: 30_000,
    count: 10,
    lane: null,
    face: 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: null,
    href: '/corpus/olc/1',
    ...over,
  }
}

const seed = (id: string, x: number, y: number, r = REACH, h = 4): Seed => ({ id, x, y, r, h })
const area = (poly: readonly Pt[]) => Math.abs(poly.reduce((sum, p, i) => sum + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)) / 2
const xs = (poly: readonly Pt[]) => poly.map((p) => p[0])

describe('clipping', () => {
  const square: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]]
  it('keeps the half asked for', () => {
    const left = clip(square, 1, 0, 1)
    expect(Math.max(...xs(left))).toBe(1)
    expect(area(left)).toBeCloseTo(2)
  })
  it('keeps everything, or nothing, when the line misses', () => {
    expect(area(clip(square, 1, 0, 5))).toBeCloseTo(4)
    expect(clip(square, 1, 0, -1)).toEqual([])
  })
})

describe('a column’s outline', () => {
  it('is a rock, not a circle: the same for one document every time, different for another', () => {
    const a = outline(seed('a', 0, 0), [])
    expect(a.length).toBeGreaterThanOrEqual(5)
    expect(outline(seed('a', 0, 0), [])).toEqual(a)
    expect(outline(seed('b', 0, 0), [])).not.toEqual(a)
    // Within its reach, and a fair share of it.
    for (const [x, y] of a) expect(Math.hypot(x, y)).toBeLessThanOrEqual(REACH * 1.15)
    expect(area(a)).toBeGreaterThan(REACH * REACH * 1.6)
  })

  it('gives up what is nearer to a neighbour, and so does the neighbour: they share a wall', () => {
    const a = seed('a', 0, 0)
    const b = seed('b', 2, 0)
    const alone = outline(a, [a])
    const crowded = outline(a, [a, b])
    expect(area(crowded)).toBeLessThan(area(alone))
    expect(Math.max(...xs(crowded))).toBeCloseTo(1, 5)
    expect(Math.min(...xs(outline(b, [a, b])))).toBeCloseTo(1, 5)
  })

  it('is not touched by one that is out of reach', () => {
    const a = seed('a', 0, 0)
    expect(outline(a, [a, seed('far', 10, 0)])).toEqual(outline(a, [a]))
  })

  it('holds almost no ground while it is growing, and its neighbour keeps almost all of its own', () => {
    const a = seed('a', 0, 0)
    const sprout = seed('b', 2, 0, 0.3)
    const whole = area(outline(a, [a]))
    expect(area(outline(a, [a, sprout]))).toBeGreaterThan(whole * 0.9)
    expect(area(outline(sprout, [a, sprout]))).toBeLessThan(0.4)
    expect(outline(seed('none', 2, 0, 0), [a])).toEqual([])
  })
})

describe('a column, drawn', () => {
  const poly = outline(seed('a', 10, 10), [])
  it('has walls, strata, a foot and a top', () => {
    const drawn = draw(poly, 4)
    expect(drawn.light + drawn.shade).not.toBe('')
    expect(drawn.edge.startsWith('M')).toBe(true)
    expect(drawn.top.split(' ').length).toBe(poly.length)
  })
  it('has more strata the taller it is: the strata are the length, counted', () => {
    const count = (d: string) => d.split('M').length - 1
    expect(count(draw(poly, 8).strata)).toBeGreaterThan(count(draw(poly, 2).strata) * 3)
  })
  it('is nothing at all when it has no outline', () => {
    expect(draw([], 4).top).toBe('')
    expect(shadow([], 4)).toBe('')
  })
  it('casts further the taller it is, and nothing when it is flat', () => {
    const reach = (points: string) => Math.max(...points.split(' ').map((p) => Number(p.split(',')[0])))
    expect(reach(shadow(poly, 8))).toBeGreaterThan(reach(shadow(poly, 2)))
    expect(shadow(poly, 0)).toBe('')
  })
})

describe('the ground', () => {
  it('stands each document at its date, earliest at the left, and never anywhere else', () => {
    const laid = ground([doc({ id: 'late', at: dayOf('2020-01-01') }), doc({ id: 'early', at: dayOf('1950-01-01') }), doc({ id: 'mid', at: dayOf('1985-01-01') })])
    const x = Object.fromEntries(laid.seeds.map((each) => [each.id, each.x]))
    expect(x.early).toBeCloseTo(laid.from)
    expect(x.late).toBeCloseTo(laid.to)
    expect(x.mid).toBeGreaterThan(x.early)
    expect(x.mid).toBeLessThan(x.late)
  })

  it('makes room in depth, not along the ground: a crowded date is a deep one', () => {
    const same = dayOf('2001-09-18')
    const laid = ground([doc({ id: 'a', at: same }), doc({ id: 'b', at: same }), doc({ id: 'c', at: same }), doc({ id: 'z', at: dayOf('1990-01-01') })])
    const crowd = laid.seeds.filter((each) => each.id !== 'z')
    expect(new Set(crowd.map((each) => each.x)).size).toBe(1)
    expect(new Set(crowd.map((each) => each.y)).size).toBe(3)
    for (const a of crowd) for (const b of crowd) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(APART * 0.89)
  })

  it('stands what has no date apart, at the left, and says how many', () => {
    const laid = ground([doc({ id: 'dated' }), doc({ id: 'undated', at: null, when: null })])
    expect(laid.unplaced).toBe(1)
    const undated = laid.seeds.find((each) => each.id === 'undated')
    expect(undated && undated.x).toBeLessThan(laid.from - APART)
  })

  it('gives each kind a row, back to front in the order they arrive', () => {
    const laid = ground([doc({ id: 'n', lane: 'notice' }), doc({ id: 'r', lane: 'rule' })])
    expect(laid.lanes.map((lane) => lane.name)).toEqual(['notice', 'rule'])
    expect(laid.lanes[1].y).toBeGreaterThan(laid.lanes[0].y + APART)
  })

  it('makes a longer document taller', () => {
    const laid = ground([doc({ id: 'short', chars: 6000 }), doc({ id: 'long', chars: 600_000 })])
    const h = Object.fromEntries(laid.seeds.map((each) => [each.id, each.h]))
    expect(h.long).toBeGreaterThan(h.short * 1.5)
  })

  it('is empty, with no span, for nothing', () => {
    const laid = ground([])
    expect(laid.seeds).toEqual([])
    expect(laid.span).toBeNull()
  })
})
