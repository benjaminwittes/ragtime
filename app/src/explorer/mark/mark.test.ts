/**
 * The mark's arithmetic: what a letter looks like at a given distance behind the brush, how the
 * brush walks the letters at a constant speed, how lines are numbered across blocks, and where
 * the signature goes. The DOM and the canvas are not tested here; these are the parts a refactor
 * could break without anyone seeing it until a phone does.
 */

import { describe, expect, it } from 'vitest'
import type { Element, Root } from 'hast'

import { MARK } from './config.ts'
import { parseColor } from './glyph.ts'
import { advance, letterColor, letterLook, lineIds, SETTLE_RUNWAY } from './reveal.ts'
import { rehypeSignature } from './tail.ts'

describe('letterLook', () => {
  it('is invisible at the brush, solid ink well behind it, and never goes back', () => {
    expect(letterLook(0)).toEqual({ opacity: 0, settle: 0 })
    expect(letterLook(-50).opacity).toBe(0)
    const behind = letterLook(MARK.edge + MARK.solid)
    expect(behind).toEqual({ opacity: 1, settle: 1 })
    let last = -1
    for (let d = 0; d <= MARK.edge + MARK.solid; d += 5) {
      const o = letterLook(d).opacity
      expect(o).toBeGreaterThanOrEqual(last)
      last = o
    }
  })

  it('leaves a letter fully visible but still in the mark colour at the end of the edge', () => {
    const l = letterLook(MARK.edge)
    expect(l.opacity).toBe(1)
    expect(l.settle).toBe(0)
  })
})

describe('letterColor', () => {
  const teal = [0, 100, 120] as const
  const ink = [10, 20, 30] as const
  it('blends from the mark colour to ink, and hands back to the page once it is ink', () => {
    expect(letterColor(teal, ink, 0)).toBe('rgb(0,100,120)')
    expect(letterColor(teal, ink, 0.5)).toBe('rgb(5,60,75)')
    expect(letterColor(teal, ink, 1)).toBe('')
  })
})

describe('lineIds', () => {
  const box = (left: number, right: number, top: number) => ({ left, right, top, bottom: top + 20 })
  it('counts a new line when the letters wrap back to the left or move down', () => {
    expect(lineIds([box(0, 8, 0), box(8, 16, 0), box(0, 8, 24), box(8, 16, 24)])).toEqual([0, 0, 1, 1])
  })
  it('walks across blocks: a paragraph, then a list item further down and indented', () => {
    expect(lineIds([box(0, 8, 0), box(8, 16, 0), box(22, 30, 60), box(30, 38, 60)])).toEqual([0, 0, 1, 1])
  })
  it('is empty for nothing', () => {
    expect(lineIds([])).toEqual([])
  })
})

describe('advance', () => {
  it('moves at the constant brush speed, whatever the letter width', () => {
    // 530 px/s over 10px letters: one letter every 1/53 s.
    expect(advance(0, 1, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBeCloseTo(53, 5)
    // a 20 px letter takes twice as long as a 10 px one.
    const wide = advance(0, 0.01, [20, 10])
    const narrow = advance(0, 0.01, [10, 10])
    expect(narrow / wide).toBeCloseTo(2, 5)
  })
  it('stops at the last letter', () => {
    expect(advance(2.9, 5, [10, 10, 10])).toBe(3)
    expect(advance(3, 1, [10, 10, 10])).toBe(3)
  })
  it('does not stall on a zero-width letter', () => {
    expect(advance(0, 0.1, [0, 10])).toBeGreaterThan(0)
  })
})

describe('parseColor', () => {
  it('reads what a stylesheet can hold, and says no to the rest', () => {
    expect(parseColor('#2b6872')).toEqual([43, 104, 114])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3])
    expect(parseColor('teal')).toBeNull()
  })
})

describe('SETTLE_RUNWAY', () => {
  it('is long enough for the last letter to finish settling to ink', () => {
    expect(SETTLE_RUNWAY).toBeGreaterThan(MARK.edge + MARK.solid + MARK.lead)
  })
})

const el = (tagName: string, ...children: Element['children']): Element => ({ type: 'element', tagName, properties: {}, children })
const text = (value: string) => ({ type: 'text' as const, value })
const run = (...children: Element['children']): Root => {
  const root: Root = { type: 'root', children }
  rehypeSignature()(root)
  return root
}
const classOf = (n: unknown) => ((n as Element).properties?.className as string[] | undefined)?.[0]

describe('rehypeSignature', () => {
  it('holds the last word of the last paragraph with the glyph', () => {
    const root = run(el('p', text('First paragraph.')), el('p', text('The Court held that it applies.')))
    const last = root.children[1] as Element
    expect(last.children[0]).toEqual(text('The Court held that it '))
    const t = last.children[1] as Element
    expect(classOf(t)).toBe('mark-tail')
    expect(t.children[0]).toEqual(text('applies.'))
    expect(classOf(t.children[1])).toBe('mark-sig')
    // the first paragraph is untouched
    expect((root.children[0] as Element).children).toEqual([text('First paragraph.')])
  })

  it('keeps a trailing space with the word, so the glyph never closes up against it', () => {
    const root = run(el('p', text('one two  ')))
    const t = (root.children[0] as Element).children[1] as Element
    expect(t.children[0]).toEqual(text('two  '))
  })

  it('handles a single word with no head', () => {
    const root = run(el('p', text('Yes')))
    const kids = (root.children[0] as Element).children
    expect(kids).toHaveLength(1)
    expect(classOf(kids[0])).toBe('mark-tail')
  })

  it('goes after a link rather than inside its underline', () => {
    const root = run(el('p', text('See '), el('a', text('the opinion'))))
    const kids = (root.children[0] as Element).children
    expect(kids.map((k) => (k.type === 'element' ? k.tagName : 'text'))).toEqual(['text', 'a', 'span'])
    expect(classOf(kids[2])).toBe('mark-tail')
    expect(((kids[1] as Element).children[0] as { value: string }).value).toBe('the opinion')
  })

  it('goes at the end of the last list item', () => {
    const root = run(el('ul', text('\n'), el('li', text('a')), text('\n'), el('li', text('b c'))))
    const ul = root.children[0] as Element
    const li = ul.children[3] as Element
    expect(li.children[0]).toEqual(text('b '))
    expect(classOf(li.children[1])).toBe('mark-tail')
  })

  it('does nothing for an answer with no letters', () => {
    const root = run(el('p'), text('\n'))
    expect(JSON.stringify(root)).not.toContain('mark-')
  })
})
