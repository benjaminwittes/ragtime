import { describe, expect, it } from 'vitest'
import {
  designFromDefaults,
  designPath,
  firstChoice,
  isNight,
  mergeDesign,
  pickVariantId,
  resolveDesign,
  withPath,
} from './resolve'
import type { OwlDesign, OwlDesignPatch } from './types'

describe('designPath', () => {
  it('names the path inside the design a knob id stands for', () => {
    expect(designPath('owl.design.palette.navy')).toEqual(['palette', 'navy'])
    expect(designPath('owl.design.params.engraved.hatch')).toEqual(['params', 'engraved', 'hatch'])
  })

  it('is null for a knob that is not part of the design', () => {
    expect(designPath('owl.variant')).toBeNull()
    expect(designPath('owl.embed.hub.size')).toBeNull()
    expect(designPath('hub.measure')).toBeNull()
  })

  it('refuses a path that could reach the prototype', () => {
    expect(designPath('owl.design.__proto__.x')).toBeNull()
    expect(designPath('owl.design.palette.constructor')).toBeNull()
    expect(designPath('owl.design.')).toBeNull()
  })
})

describe('withPath', () => {
  it('sets one path without touching the original', () => {
    const before = { a: { b: 1, c: 2 }, d: 3 }
    const after = withPath(before, ['a', 'b'], 9)
    expect(after).toEqual({ a: { b: 9, c: 2 }, d: 3 })
    expect(before.a.b).toBe(1)
    expect(after.d).toBe(3)
  })

  it('makes the objects a new path runs through', () => {
    expect(withPath({}, ['params', 'engraved', 'hatch'], 4)).toEqual({ params: { engraved: { hatch: 4 } } })
  })
})

describe('mergeDesign', () => {
  const base = { palette: { navy: '#111', cream: '#eee' }, motion: { period: 6 }, books: [1, 2, 3] }

  it('merges plain objects deeply and replaces everything else', () => {
    const out = mergeDesign(base, { palette: { navy: '#fff' }, books: [9] })
    expect(out.palette).toEqual({ navy: '#fff', cream: '#eee' })
    expect(out.books).toEqual([9])
    expect(out.motion).toEqual({ period: 6 })
  })

  it('leaves the base alone', () => {
    mergeDesign(base, { palette: { navy: '#fff' } })
    expect(base.palette.navy).toBe('#111')
  })

  it('is the base itself for no patch, and for an empty one', () => {
    expect(mergeDesign(base, undefined)).toBe(base)
    expect(mergeDesign(base, {})).toEqual(base)
  })

  it('skips undefined values', () => {
    expect(mergeDesign(base, { motion: { period: undefined } }).motion.period).toBe(6)
  })

  it('skips keys that could reach the prototype', () => {
    const out = mergeDesign(base, JSON.parse('{"__proto__":{"polluted":1}}'))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(out)).toEqual(Object.keys(base))
  })
})

describe('designFromDefaults', () => {
  it('lays each design knob’s default at the path its id names', () => {
    const design = designFromDefaults(
      { voice: null },
      { 'owl.design.palette.navy': '#1F2A44', 'owl.design.motion.gazeTravel': 0.33, 'owl.variant': 'base' },
    )
    expect(design).toEqual({ voice: null, palette: { navy: '#1F2A44' }, motion: { gazeTravel: 0.33 } })
  })
})

describe('resolveDesign', () => {
  const base = {
    palette: { navy: '#111', cream: '#eee' },
    motion: { blinkPeriod: 6.5 },
  } as unknown as OwlDesign
  const night = { palette: { navy: '#fff', cream: '#000' } } as OwlDesignPatch
  const calm = { motion: { blinkPeriod: 11 } } as OwlDesignPatch

  it('is the base for no variant and nothing tuned', () => {
    expect(resolveDesign(base, [undefined], {})).toEqual(base)
  })

  it('puts a variant over the base', () => {
    const out = resolveDesign(base, [night], {})
    expect(out.palette).toEqual({ navy: '#fff', cream: '#000' })
    expect(out.motion.blinkPeriod).toBe(6.5)
  })

  it('puts a tuned knob over the variant, so a slider always does something', () => {
    const out = resolveDesign(base, [night], { 'owl.design.palette.navy': '#abc' })
    expect(out.palette).toEqual({ navy: '#abc', cream: '#000' })
  })

  it('applies patches in order', () => {
    expect(resolveDesign(base, [night, calm], {}).motion.blinkPeriod).toBe(11)
    expect(resolveDesign(base, [night, calm], {}).palette.navy).toBe('#fff')
  })

  it('ignores tuned values that are not part of the design', () => {
    const out = resolveDesign(base, [], { 'owl.variant': 'night', 'owl.embed.hub.size': '9rem' })
    expect(out).toEqual(base)
  })

  it('does not change the base', () => {
    resolveDesign(base, [night], { 'owl.design.motion.blinkPeriod': 1 })
    expect(base.palette.navy).toBe('#111')
    expect(base.motion.blinkPeriod).toBe(6.5)
  })
})

describe('pickVariantId', () => {
  it('takes the most specific choice that says something', () => {
    expect(pickVariantId('night', 'calm')).toBe('night')
    expect(pickVariantId(undefined, 'calm')).toBe('calm')
    expect(pickVariantId('inherit', undefined, 'calm')).toBe('calm')
    expect(pickVariantId('', 'calm')).toBe('calm')
  })

  it('is the base when nobody chose', () => {
    expect(pickVariantId()).toBe('base')
    expect(pickVariantId(undefined, 'inherit')).toBe('base')
  })

  it('firstChoice says so when nobody chose, rather than naming the base', () => {
    expect(firstChoice(undefined, 'inherit')).toBeUndefined()
  })
})

describe('isNight', () => {
  const evening = { from: 20, until: 6 }

  it('is dark from eight in the evening until six in the morning', () => {
    expect(isNight(20, evening)).toBe(true)
    expect(isNight(23, evening)).toBe(true)
    expect(isNight(0, evening)).toBe(true)
    expect(isNight(5, evening)).toBe(true)
  })

  it('is not dark by day', () => {
    expect(isNight(6, evening)).toBe(false)
    expect(isNight(12, evening)).toBe(false)
    expect(isNight(19, evening)).toBe(false)
  })

  it('takes a window that does not wrap midnight', () => {
    expect(isNight(14, { from: 13, until: 15 })).toBe(true)
    expect(isNight(15, { from: 13, until: 15 })).toBe(false)
  })

  it('has no night when the window is empty', () => {
    expect(isNight(3, { from: 6, until: 6 })).toBe(false)
  })
})
