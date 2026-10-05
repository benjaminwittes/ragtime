import { describe, expect, it } from 'vitest'
import type { Tunable } from '@/tune/types'
import { find, score, words } from './search'

const knob = (over: Partial<Tunable>): Tunable => ({
  id: 'owl.x',
  label: 'Thing',
  group: 'The owl',
  scope: 'owl',
  kind: 'boolean',
  value: true,
  source: { file: 'x' },
  ...over,
})

describe('settings search', () => {
  it('splits a query into lower-case words', () => {
    expect(words('  Owl, motion!')).toEqual(['owl', 'motion'])
  })

  it('finds every knob under a scope by typing its name', () => {
    const a = { knob: knob({ id: 'owl.a', label: 'Show the owl' }), scope: 'Owl' }
    const b = { knob: knob({ id: 'owl.b', label: 'Owl motion' }), scope: 'Owl' }
    const c = { knob: knob({ id: 'hub.c', label: 'Rows', scope: 'hub', group: 'Layout' }), scope: 'Hub' }
    expect(find([a, b, c], 'owl').map((r) => r.knob.id)).toEqual(['owl.a', 'owl.b'])
  })

  it('needs every word to match something', () => {
    const k = knob({ label: 'Owl motion' })
    expect(score(k, 'Owl', 'owl motion')).toBeGreaterThan(0)
    expect(score(k, 'Owl', 'owl colour')).toBe(0)
  })

  it('matches the start of a word, and the note as a last resort', () => {
    const k = knob({ label: 'Photocopy finish', note: 'Specks of toner.' })
    expect(score(k, 'Owl', 'photo')).toBeGreaterThan(score(k, 'Owl', 'toner'))
    expect(score(k, 'Owl', 'toner')).toBeGreaterThan(0)
  })

  it('puts a reader’s setting ahead of a tuner’s on a tie', () => {
    const tuner = { knob: knob({ id: 'owl.t', label: 'Voice' }), scope: 'Owl' }
    const reader = { knob: knob({ id: 'owl.r', label: 'Voice', user: true }), scope: 'Owl' }
    expect(find([tuner, reader], 'voice').map((r) => r.knob.id)).toEqual(['owl.r', 'owl.t'])
  })

  it('finds nothing for an empty query', () => {
    expect(find([{ knob: knob({}), scope: 'Owl' }], '  ')).toEqual([])
  })
})
