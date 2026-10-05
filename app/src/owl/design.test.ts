import { describe, expect, it } from 'vitest'
import { allTunables } from '@/tune/registry'
import { baseDesign } from './design'
import { DESIGN_PREFIX, designPath } from './resolve'
import { getStyle } from './styles'
import { getVariant, variantList, variantOptions } from './variants'

/**
 * The base design is the owl as sent. These pin it: if a number here has to change, the owl
 * has changed, and that should be a decision rather than a side effect.
 */
describe('baseDesign', () => {
  const design = baseDesign()

  it('draws with the line tiles, in navy, speaking', () => {
    expect(design.style).toBe('lines')
    expect(design.palette).toEqual({ navy: '#1F2A44' })
    expect(design.voice).toBe('ragtime')
  })

  it('keeps the night from eight in the evening until six in the morning', () => {
    expect(design.night).toEqual({ from: 20, until: 6 })
  })

  it('has a knob for every scalar it holds, and each knob names a place in the design', () => {
    for (const knob of allTunables().filter((k) => k.id.startsWith(DESIGN_PREFIX))) {
      expect(designPath(knob.id), knob.id).not.toBeNull()
    }
  })

  it('every knob in the Owl scope has the Owl scope’s source file under src/owl', () => {
    for (const knob of allTunables().filter((k) => k.scope === 'owl')) {
      expect(knob.source.file, knob.id).toMatch(/^src\/owl\//)
    }
  })
})

describe('variants', () => {
  it('lists the base first', () => {
    expect(variantList().map((v) => v.id)[0]).toBe('base')
  })

  it('has an empty patch for the base, so it is the base design exactly', () => {
    expect(getVariant('base')?.design).toEqual({})
  })

  it('offers every variant to the knob that picks one', () => {
    expect(variantOptions().map((o) => o.value)).toEqual(variantList().map((v) => v.id))
  })
})

describe('render styles', () => {
  it('falls back to blank for a style that is not there', () => {
    expect(getStyle('blank').id).toBe('blank')
    expect(getStyle('no-such-style').id).toBe('blank')
  })
})
