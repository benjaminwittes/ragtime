import { describe, expect, it } from 'vitest'
import { linesFor, pickLine, remember, RECENT } from './select'
import type { OwlVoice } from './types'

const voice: OwlVoice = {
  id: 'test',
  label: 'Test',
  note: '',
  lines: {
    searching: ['a', 'b', 'c'],
    'search-empty': ['only'],
    'not-found': ['x', 'y'],
  },
}

const other: OwlVoice = { ...voice, id: 'other', lines: { 'wrong-code': ['no'] } }

describe('pickLine', () => {
  it('says a line the voice has for the occasion', () => {
    expect(['a', 'b', 'c']).toContain(pickLine(voice, 'searching', [], 0.5))
  })

  it('is repeatable: the same roll gives the same line', () => {
    expect(pickLine(voice, 'searching', [], 0.5)).toBe(pickLine(voice, 'searching', [], 0.5))
    expect(pickLine(voice, 'searching', [], 0)).toBe('a')
    expect(pickLine(voice, 'searching', [], 0.99)).toBe('c')
  })

  it('stays silent on an occasion the voice has no line for, and does not borrow another voice’s', () => {
    expect(pickLine(voice, 'wrong-code', [], 0.5)).toBeNull()
    expect(pickLine(other, 'searching', [], 0.5)).toBeNull()
    expect(pickLine(undefined, 'searching', [], 0.5)).toBeNull()
  })

  it('never repeats the line it just said while another exists', () => {
    for (const roll of [0, 0.2, 0.5, 0.8, 0.999]) {
      expect(pickLine(voice, 'not-found', ['x'], roll)).toBe('y')
      expect(pickLine(voice, 'not-found', ['y'], roll)).toBe('x')
    }
  })

  it('puts off lines said recently until the rest have had a turn', () => {
    expect(pickLine(voice, 'searching', ['a'], 0)).toBe('b')
    expect(pickLine(voice, 'searching', ['a', 'b'], 0)).toBe('c')
  })

  it('once every line is recent, takes any but the last', () => {
    for (const roll of [0, 0.4, 0.99]) {
      const picked = pickLine(voice, 'searching', ['a', 'b', 'c'], roll)
      expect(picked).not.toBe('c')
      expect(['a', 'b']).toContain(picked)
    }
  })

  it('says a single line once, and is then silent rather than repeating it', () => {
    expect(pickLine(voice, 'search-empty', [], 0.3)).toBe('only')
    expect(pickLine(voice, 'search-empty', ['only'], 0.3)).toBeNull()
  })

  it('survives a roll outside [0, 1)', () => {
    expect(pickLine(voice, 'searching', [], 1)).toBe('c')
    expect(pickLine(voice, 'searching', [], -3)).toBe('a')
  })

  it('ignores blank lines', () => {
    const blank: OwlVoice = { ...voice, lines: { searching: ['', '  '] } }
    expect(pickLine(blank, 'searching', [], 0)).toBeNull()
  })

  it('walks a whole voice without ever saying one line twice running', () => {
    let recent: string[] = []
    let last: string | null = null
    let state = 7
    for (let i = 0; i < 200; i++) {
      state = (state * 1103515245 + 12345) % 2147483648
      const line = pickLine(voice, 'searching', recent, state / 2147483648)
      expect(line).not.toBeNull()
      expect(line).not.toBe(last)
      last = line
      recent = remember(recent, line as string)
    }
  })
})

describe('remember', () => {
  it('keeps the newest few and no duplicates', () => {
    expect(remember([], 'a')).toEqual(['a'])
    expect(remember(['a', 'b'], 'a')).toEqual(['b', 'a'])
    let recent: string[] = []
    for (const line of ['a', 'b', 'c', 'd', 'e']) recent = remember(recent, line)
    expect(recent).toEqual(['c', 'd', 'e'])
    expect(recent).toHaveLength(RECENT)
  })
})

describe('linesFor', () => {
  it('is empty where there is nothing to say', () => {
    expect(linesFor(voice, 'wrong-code')).toEqual([])
    expect(linesFor(undefined, 'searching')).toEqual([])
  })
})
