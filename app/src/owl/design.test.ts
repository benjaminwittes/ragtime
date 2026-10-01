import { describe, expect, it } from 'vitest'
import { allTunables } from '@/tune/registry'
import { baseDesign } from './design'
import { DESIGN_PREFIX, designPath, resolveDesign } from './resolve'
import { getStyle, styleList } from './styles'
import { PALETTE_KEYS } from './types'
import { getVariant, variantList, variantOptions } from './variants'

/**
 * The base design is the drawing as sent. These pin it: if a number here has to change,
 * the owl has changed, and that should be a decision rather than a side effect.
 */
describe('baseDesign', () => {
  const design = baseDesign()

  it('carries the concept sheet’s inks', () => {
    expect(design.palette).toEqual({
      navy: '#1F2A44',
      cream: '#EFE6D2',
      slate: '#3D4C6E',
      wing: '#2E3B57',
      tan: '#C9B48A',
      gold: '#E0A93A',
      lens: '#F7E3A6',
      flame: '#F2B84B',
      page: '#FFFFFF',
      pupil: '#1F2A44',
    })
    expect(Object.keys(design.palette).sort()).toEqual([...PALETTE_KEYS].sort())
  })

  it('carries the lines and shapes that used to be literals in the drawing', () => {
    expect(design.stroke).toEqual({ rim: 2.5, book: 1.5, lantern: 2, handle: 2 })
    expect(design.shape).toEqual({
      disc: 48,
      bookHeight: 6,
      bookRadius: 1.5,
      lanternRadius: 2,
      glowRadius: 17,
      glowCore: 0.85,
    })
  })

  it('carries the timings that used to be literals in the stylesheet', () => {
    expect(design.motion).toEqual({
      blink: true,
      blinkPeriod: 6.5,
      blinkClosed: 0.08,
      gazeFollow: true,
      gazeTravel: 0.33,
      gazeEase: 140,
      glowLit: 0.7,
      glowFade: 500,
      searchPeriod: 1.1,
      searchLow: 0.35,
      searchHigh: 1,
      shakeTime: 420,
      shakeReach: 4,
    })
    expect(design.night).toEqual({ from: 20, until: 6 })
  })

  it('draws with the flat style, with nothing standing and no voice', () => {
    expect(design.style).toBe('flat')
    expect(design.standing).toEqual({})
    expect(design.voice).toBeNull()
    expect(design.params).toEqual({})
  })

  it('keeps both poses', () => {
    expect(design.poses.archivist.eyes).toEqual({ left: 44, right: 56, cy: 38, r: 6, pupil: 2.2 })
    expect(design.poses.stacks.eyes).toEqual({ left: 44.5, right: 55.5, cy: 34, r: 5.5, pupil: 2 })
    expect(design.poses.stacks.books).toHaveLength(3)
    expect(design.poses.archivist.books).toHaveLength(0)
  })
})

describe('the knobs behind it', () => {
  it('every design knob names a path that exists in the design', () => {
    const design = baseDesign() as unknown as Record<string, unknown>
    for (const knob of allTunables().filter((k) => k.id.startsWith(DESIGN_PREFIX))) {
      const path = designPath(knob.id)
      expect(path, knob.id).not.toBeNull()
      let at: unknown = design
      for (const key of path ?? []) at = (at as Record<string, unknown> | undefined)?.[key]
      expect(at, knob.id).toBe(knob.value)
    }
  })

  it('every knob in the Owl scope has the Owl scope’s source file under src/owl', () => {
    for (const knob of allTunables().filter((k) => k.scope === 'owl')) {
      expect(knob.source.file, knob.id).toMatch(/^src\/owl\//)
    }
  })
})

describe('variants', () => {
  it('lists the base first, and ships a look variant and a behaviour variant', () => {
    const ids = variantList().map((v) => v.id)
    expect(ids[0]).toBe('base')
    expect(ids).toContain('inverse')
    expect(ids).toContain('calm')
  })

  it('has an empty patch for the base, so it is the base design exactly', () => {
    expect(getVariant('base')?.design).toEqual({})
    expect(resolveDesign(baseDesign(), [getVariant('base')?.design], {})).toEqual(baseDesign())
  })

  it('keeps every variant a patch: no variant removes anything the base has', () => {
    const base = baseDesign()
    for (const variant of variantList()) {
      const out = resolveDesign(base, [variant.design], {})
      expect(Object.keys(out).sort(), variant.id).toEqual(Object.keys(base).sort())
      expect(Object.keys(out.palette).sort(), variant.id).toEqual(Object.keys(base.palette).sort())
      expect(Object.keys(out.motion).sort(), variant.id).toEqual(Object.keys(base.motion).sort())
    }
  })

  it('changes what each demonstration variant says it changes', () => {
    const base = baseDesign()
    const inverse = resolveDesign(base, [getVariant('inverse')?.design], {})
    expect(inverse.palette.cream).not.toBe(base.palette.cream)
    expect(inverse.motion).toEqual(base.motion)
    const calm = resolveDesign(base, [getVariant('calm')?.design], {})
    expect(calm.motion.blinkPeriod).toBeGreaterThan(base.motion.blinkPeriod)
    expect(calm.palette).toEqual(base.palette)
  })

  it('offers every variant to the knob that picks one', () => {
    expect(variantOptions().map((o) => o.value)).toEqual(variantList().map((v) => v.id))
  })
})

describe('render styles', () => {
  it('registers flat, and falls back to it for a style that is not there', () => {
    expect(styleList().map((s) => s.id)).toContain('flat')
    expect(getStyle('flat').id).toBe('flat')
    expect(getStyle('no-such-style').id).toBe('flat')
  })
})
