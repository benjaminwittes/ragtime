/**
 * The mark's arithmetic: which lines the brush walks and where it is on them, how fast it closes
 * on the end of what has arrived, how lines are numbered across blocks, and where the signature
 * goes. The DOM and the canvas are not tested here; these are the parts a refactor
 * could break without anyone seeing it until a phone does.
 */

import { describe, expect, it } from 'vitest'
import type { Element, Root } from 'hast'

import { MARK } from './config.ts'
import { parseColor } from './glyph.ts'
import { advance, lineIds, linesOf, locate, pathLength } from './reveal.ts'
import { rehypeSignature } from './tail.ts'

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

describe('linesOf', () => {
  const box = (left: number, top: number, w = 40, h = 20) => ({ left, right: left + w, top, bottom: top + h })
  it('joins the runs of one line into one line, and starts another when the text wraps or moves down', () => {
    // A line of two runs (a word, then a link), a wrapped second line, then a paragraph below.
    const lines = linesOf([box(0, 0, 100), box(100, 0, 60), box(0, 24, 80), box(0, 60, 50)])
    expect(lines).toEqual([
      { left: 0, right: 160, top: 0, bottom: 20 },
      { left: 0, right: 80, top: 24, bottom: 44 },
      { left: 0, right: 50, top: 60, bottom: 80 },
    ])
    expect(pathLength(lines)).toBe(290)
  })
  it('is nothing for nothing', () => {
    expect(linesOf([])).toEqual([])
    expect(pathLength([])).toBe(0)
  })
})

describe('locate', () => {
  const lines = [
    { left: 10, right: 110, top: 0, bottom: 20 },
    { left: 10, right: 60, top: 24, bottom: 44 },
  ]
  it('finds the line and the place on it', () => {
    expect(locate(lines, 0)).toEqual({ line: 0, x: 10 })
    expect(locate(lines, 40)).toEqual({ line: 0, x: 50 })
    expect(locate(lines, 100)).toEqual({ line: 1, x: 10 })
    expect(locate(lines, 125)).toEqual({ line: 1, x: 35 })
  })
  it('is at the end of the last line once the brush has gone as far as there is', () => {
    expect(locate(lines, 150)).toEqual({ line: 1, x: 60 })
    expect(locate(lines, 9999)).toEqual({ line: 1, x: 60 })
  })
  it('is nowhere when there are no lines', () => {
    expect(locate([], 10)).toBeNull()
  })
})

describe('advance', () => {
  it('never moves slower than the floor, so the last few letters are not crept up on', () => {
    expect(advance(0, 10_000, 0.001)).toBeGreaterThanOrEqual(MARK.speed * 0.001)
    // Twenty px from the end, a share of what is left would be almost nothing.
    expect(advance(980, 1000, 0.005)).toBeCloseTo(980 + MARK.speed * 0.005, 5)
  })
  it('closes on the end of what has arrived in about the catch-up time, however much that is', () => {
    for (const total of [2_000, 20_000, 200_000]) {
      let shown = 0
      let t = 0
      while (shown < total * 0.95) {
        shown = advance(shown, total, 1 / 60)
        t += 1 / 60
      }
      // A whole answer landing at once is crossed in well under a second.
      expect(t).toBeLessThan(MARK.catchUp * 3.5)
    }
  })
  it('keeps pace with an answer that streams: it is never far behind what has arrived', () => {
    let shown = 0
    let total = 0
    let worst = 0
    for (let frame = 0; frame < 600; frame++) {
      total += 900 / 60 // text arriving at 900 px a second
      shown = advance(shown, total, 1 / 60)
      worst = Math.max(worst, total - shown)
    }
    expect(worst).toBeLessThan(40)
  })
  it('stops at the end, and never goes back', () => {
    expect(advance(500, 500, 1)).toBe(500)
    expect(advance(600, 500, 1)).toBe(600)
    expect(advance(499, 500, 1)).toBe(500)
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
