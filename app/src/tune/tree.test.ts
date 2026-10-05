import { describe, expect, it } from 'vitest'
import { isOn, nest } from './tree'
import type { Tunable } from './types'

const knob = (id: string, over: Partial<Tunable> = {}): Tunable => ({
  id,
  label: id,
  group: 'g',
  scope: 'owl',
  kind: 'boolean',
  value: true,
  source: { file: 'x' },
  ...over,
})

describe('nesting', () => {
  it('puts a knob under its parent, whatever group it is in', () => {
    const roots = nest([knob('a'), knob('b', { parent: 'a', group: 'other' }), knob('c', { parent: 'b' }), knob('d')])
    expect(roots.map((r) => r.knob.id)).toEqual(['a', 'd'])
    expect(roots[0]!.kids[0]!.knob.id).toBe('b')
    expect(roots[0]!.kids[0]!.kids[0]!.knob.id).toBe('c')
  })

  it('leaves a knob whose parent is not in the list as an ordinary row', () => {
    expect(nest([knob('b', { parent: 'a' })]).map((r) => r.knob.id)).toEqual(['b'])
  })

  it('does not loop on a knob that names itself', () => {
    expect(nest([knob('a', { parent: 'a' })]).map((r) => r.knob.id)).toEqual(['a'])
  })
})

describe('on and off', () => {
  it('reads off, none, still, false, empty and zero as off', () => {
    for (const v of [false, 'off', 'none', 'still', '', 0, undefined]) expect(isOn(v)).toBe(false)
    for (const v of [true, 'calm', 'lines', 12]) expect(isOn(v)).toBe(true)
  })
})
