import { describe, expect, it } from 'vitest'
import { fitNote, MIN_BESIDE, type Box } from './fit'

const viewport = { width: 390, height: 844 }
const base = { gap: 8, margin: 8, viewport }
const box = (left: number, top: number, size: number): Box => ({ left, top, right: left + size, bottom: top + size })

describe('fitNote', () => {
  it('keeps a note beside the owl where there is room', () => {
    const fit = fitNote({ ...base, place: 'beside', anchor: box(16, 100, 56), note: { width: 200, height: 40 } })
    expect(fit).toEqual({ place: 'beside', maxWidth: 390 - 72 - 8 - 8, shift: 0 })
  })

  it('narrows the note to the room beside the owl', () => {
    const fit = fitNote({ ...base, place: 'beside', anchor: box(150, 100, 90), note: { width: 256, height: 40 } })
    expect(fit.place).toBe('beside')
    expect(fit.maxWidth).toBe(390 - 240 - 16)
  })

  it('moves to the other side when the first has no readable column', () => {
    const fit = fitNote({ ...base, place: 'beside', anchor: box(280, 100, 90), note: { width: 200, height: 40 } })
    expect(fit.place).toBe('beside-start')
    expect(fit.maxWidth).toBe(280 - 16)
  })

  it('goes above, centred, when neither side has room and the paper above does', () => {
    // 84px to the right and 94px to the left: both under the readable minimum.
    const fit = fitNote({ ...base, place: 'beside', anchor: box(110, 100, 90), note: { width: 200, height: 40 }, viewport: { width: 300, height: 844 } })
    expect(MIN_BESIDE).toBeGreaterThan(94)
    expect(fit.place).toBe('above')
  })

  it('goes below, centred, only when neither side nor the top has room', () => {
    const fit = fitNote({ ...base, place: 'beside', anchor: box(110, 20, 90), note: { width: 200, height: 40 }, viewport: { width: 300, height: 844 } })
    expect(fit.place).toBe('below')
  })

  it('pulls a centred note back from the left edge', () => {
    const fit = fitNote({ ...base, place: 'below', anchor: box(0, 100, 40), note: { width: 200, height: 40 } })
    // Centred on 20, a 200px note would start at -80; it must start at the margin.
    expect(fit.shift).toBe(88)
  })

  it('pulls a centred note back from the right edge', () => {
    const fit = fitNote({ ...base, place: 'above', anchor: box(350, 300, 40), note: { width: 200, height: 40 } })
    expect(fit.shift).toBe(-(370 + 100 - 382))
  })

  it('never lets a centred note be wider than the screen', () => {
    const fit = fitNote({ ...base, place: 'below', anchor: box(150, 100, 90), note: { width: 900, height: 40 } })
    expect(fit.maxWidth).toBe(390 - 16)
    expect(fit.shift).toBe(0)
  })

  it('flips above to below when the top of the screen has no room', () => {
    const fit = fitNote({ ...base, place: 'above', anchor: box(150, 20, 90), note: { width: 100, height: 40 } })
    expect(fit.place).toBe('below')
  })

  it('flips below to above at the foot of the screen', () => {
    const fit = fitNote({ ...base, place: 'below', anchor: box(150, 780, 56), note: { width: 100, height: 40 } })
    expect(fit.place).toBe('above')
  })

  it('leaves an inline note alone', () => {
    expect(fitNote({ ...base, place: 'inline', anchor: box(0, 0, 10), note: { width: 900, height: 9 } })).toEqual({
      place: 'inline',
      maxWidth: null,
      shift: 0,
    })
  })
})
