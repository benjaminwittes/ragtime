import { describe, expect, it } from 'vitest'
import { frameAt, geometry, groupRows, rowTimes, slicesOf, toneOf, type Measured, type MorphParams } from './engine'

/** Two rows of three letters, as a layout the browser might have made, with a raster that has ink where the letters are. */
function layout(rows = 2): Measured {
  const w = 240
  const rowH = 40
  const h = rowH * rows
  const data = new Float32Array(w * h)
  const letters: Measured['letters'] = []
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 3; k++) {
      const l = 20 + k * 60
      letters.push({ l, r: l + 44, row: r })
      for (let y = r * rowH + 8; y < r * rowH + 32; y++) for (let x = l + 4; x < l + 40; x++) data[y * w + x] = 1
    }
  }
  return {
    grid: { w, h, data },
    w,
    h,
    spacing: 4,
    letters,
    rows: Array.from({ length: rows }, (_, r) => ({ y0: r * rowH, y1: (r + 1) * rowH })),
  }
}

const params: MorphParams = { cover: 0.5, winWidth: 0.5, windowOn: true, spread: 4, gain: 1, ramp: 1, shift: 0, trail: 0.6, entry: 0.6, pieces: 2, stagger: 0.5 }

describe('rowTimes', () => {
  it('is just t for one row', () => {
    expect(rowTimes(0.3, 1, 0.5)).toEqual([0.3])
  })
  it('starts every row together with no stagger', () => {
    expect(rowTimes(0.4, 3, 0)).toEqual([0.4, 0.4, 0.4])
  })
  it('writes rows one after another with a stagger of 1, and ends them all at t = 1', () => {
    expect(rowTimes(0.5, 2, 1)).toEqual([1, 0])
    expect(rowTimes(1, 4, 0.5)).toEqual([1, 1, 1, 1])
    expect(rowTimes(0, 4, 0.5)).toEqual([0, 0, 0, 0])
  })
})

describe('geometry', () => {
  it('has the window, and its entry taper, off the left of the row at t = 0', () => {
    const g = geometry(240, 200, params, 0)
    expect(g.hi * 240 + params.entry * g.winPx).toBeCloseTo(0, 5)
  })
  it('has the lines, their trail included, past the end of the row at t = 1', () => {
    const g = geometry(240, 200, params, 1)
    expect(g.lo * 240 - params.trail * g.winPx).toBeGreaterThanOrEqual(200 - 1e-6)
  })
  it('eases the shift to zero at both ends whatever it is', () => {
    for (const shift of [-1, -0.39, 0.7, 1]) {
      expect(geometry(240, 200, { ...params, shift }, 0).shiftNow).toBe(0)
      expect(geometry(240, 200, { ...params, shift }, 1).shiftNow).toBeCloseTo(0, 10)
      expect(geometry(240, 200, { ...params, shift }, 0.5).shiftNow).toBeCloseTo(shift, 10)
    }
  })
})

describe('frameAt', () => {
  const m = layout()
  const toned = toneOf(m, params.spread, params.gain)

  it('draws nothing at t = 0', () => {
    const f = frameAt(m, toned, params, 0)
    expect(f.finished).toBe(false)
    expect(f.underlay).toBe('')
    expect(f.morph).toBe('')
  })

  it('ends as the text at t = 1, for any shift: every slice raw, no lines left', () => {
    for (const shift of [-1, 0, 1]) {
      const f = frameAt(m, toned, { ...params, shift }, 1)
      expect(f.finished).toBe(true)
      for (const row of f.rows) {
        expect(row.raw.every((v) => v === 1)).toBe(true)
        expect(row.lines.every((v) => v === 0)).toBe(true)
      }
    }
  })

  it('draws lines and some of the morph part of the way through', () => {
    const f = frameAt(m, toned, { ...params, stagger: 0 }, 0.5)
    expect(f.underlay.length).toBeGreaterThan(0)
    expect(f.morph.length).toBeGreaterThan(0)
  })

  it('has a slice for every piece of every letter, in the row it belongs to', () => {
    const f = frameAt(m, toned, params, 0.5)
    expect(f.rows.map((r) => r.slices.length)).toEqual([6, 6])
    expect(f.rows[1].slices.every((sl) => sl.row === 1)).toBe(true)
  })

  it('holds the second row back by the stagger', () => {
    const f = frameAt(m, toned, { ...params, stagger: 1 }, 0.4)
    // At t = 0.4 with a stagger of 1 the second row has not begun: none of its slices has turned.
    expect(f.rows[1].raw.every((v) => v === 0)).toBe(true)
    expect(f.rows[0].raw.some((v) => v > 0)).toBe(true)
  })

  it('does not move the lines when the shift changes', () => {
    const a = frameAt(m, toned, { ...params, shift: -0.5, stagger: 0 }, 0.5)
    const b = frameAt(m, toned, { ...params, shift: 0.5, stagger: 0 }, 0.5)
    expect(a.underlay).toBe(b.underlay)
    expect(a.morph).not.toBe(b.morph)
  })
})

describe('slicesOf', () => {
  it('cuts each letter into equal slices that tile it', () => {
    const slices = slicesOf([{ l: 10, r: 30, row: 0 }, null, { l: 40, r: 60, row: 1 }], 4)
    expect(slices).toHaveLength(8)
    expect(slices[0]).toEqual({ l: 10, r: 15, row: 0 })
    expect(slices[3].r).toBe(30)
    expect(slices[4].row).toBe(1)
  })
})

describe('groupRows', () => {
  const box = (l: number, top: number) => ({ l, r: l + 10, top, bottom: top + 20 })
  it('puts letters at one height in one row', () => {
    const { letters, rows } = groupRows([box(0, 0), box(10, 1), null, box(30, 0)], 40)
    expect(new Set(letters.filter(Boolean).map((l) => l!.row))).toEqual(new Set([0]))
    expect(rows).toEqual([{ y0: 0, y1: 40 }])
  })
  it('starts a new row for a letter on another line, and tiles the box between them', () => {
    const { letters, rows } = groupRows([box(0, 0), box(10, 0), box(0, 30), box(10, 30)], 60)
    expect(letters.map((l) => l!.row)).toEqual([0, 0, 1, 1])
    expect(rows).toHaveLength(2)
    expect(rows[0].y0).toBe(0)
    expect(rows[0].y1).toBe(rows[1].y0)
    expect(rows[1].y1).toBe(60)
  })
  it('numbers rows top to bottom whatever order the letters arrive in', () => {
    const { letters } = groupRows([box(0, 30), box(0, 0)], 60)
    expect(letters.map((l) => l!.row)).toEqual([1, 0])
  })
})
