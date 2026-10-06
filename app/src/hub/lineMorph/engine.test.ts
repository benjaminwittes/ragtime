import { describe, expect, it } from 'vitest'
import { frameAt, geometry, groupRows, rowTimes, slicesOf, sweep, timing, toneOf, type Measured, type MorphParams } from './engine'

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
    size: 20,
    letters,
    rows: Array.from({ length: rows }, (_, r) => ({ y0: r * rowH, y1: (r + 1) * rowH })),
  }
}

const params: MorphParams = { cover: 0.5, winWidth: 4, windowOn: true, spread: 0.2, gain: 1, ramp: 1, shift: 0, trail: 0.6, entry: 0.6, speed: 10, pieces: 2, stagger: 0.5 }

describe('timing and rowTimes', () => {
  const m = layout()
  it('has one row start with the whole, and each later one start a stagger of the row above after it', () => {
    const tm = timing(m, { ...params, stagger: 0.5 })
    expect(tm.starts[0]).toBe(0)
    expect(tm.starts[1]).toBeCloseTo(0.5 * tm.durations[0], 10)
    expect(tm.total).toBeCloseTo(tm.starts[1] + tm.durations[1], 10)
  })
  it('starts every row together with no stagger', () => {
    const tm = timing(m, { ...params, stagger: 0 })
    expect(tm.starts).toEqual([0, 0])
    expect(rowTimes(tm, tm.total / 2)[0]).toBeCloseTo(rowTimes(tm, tm.total / 2)[1], 10)
  })
  it('writes rows one after another with a stagger of 1', () => {
    const tm = timing(m, { ...params, stagger: 1 })
    // The second row starts as the first finishes.
    expect(rowTimes(tm, tm.durations[0])).toEqual([1, 0])
  })
  it('ends every row at exactly 1 at the end, and none has begun at 0', () => {
    const tm = timing(m, params)
    expect(rowTimes(tm, tm.total)).toEqual([1, 1])
    expect(rowTimes(tm, 0)).toEqual([0, 0])
  })
})

describe('one swipe speed', () => {
  const lettersOf = (n: number): Measured['letters'] => Array.from({ length: n }, (_, k) => ({ l: 20 + k * 20, r: 36 + k * 20, row: 0 }))
  const of = (n: number): Measured => {
    const w = 40 + n * 20
    return { grid: { w, h: 40, data: new Float32Array(w * 40) }, w, h: 40, spacing: 4, size: 20, letters: lettersOf(n), rows: [{ y0: 0, y1: 40 }] }
  }

  it('crosses the same number of ems each second, whatever the length of the text', () => {
    for (const n of [3, 12, 40]) {
      const m = of(n)
      const wordEnd = m.letters[n - 1]!.r
      const s = sweep(wordEnd, params, m.size)
      const tm = timing(m, params)
      expect((s.finishPx - s.startPx) / tm.durations[0]).toBeCloseTo(params.speed * m.size, 6)
    }
  })

  it('takes longer for a longer text and less for a shorter one', () => {
    expect(timing(of(40), params).total).toBeGreaterThan(timing(of(12), params).total)
    expect(timing(of(12), params).total).toBeGreaterThan(timing(of(3), params).total)
  })

  it('keeps the window and the band the same size in px on a short text and a long one', () => {
    const a = sweep(of(3).letters[2]!.r, params, 20)
    const b = sweep(of(40).letters[39]!.r, params, 20)
    expect(a.winPx).toBe(b.winPx)
    expect(a.bandPx).toBe(b.bandPx)
    expect(a.winPx).toBe(params.winWidth * 20)
  })

  it('scales with the type size: the same text at twice the size crosses twice the px in the same time', () => {
    const m = of(10)
    const big = { ...m, size: 40 }
    // Window and speed are in em, so doubling the em doubles the px each second and the window with it.
    expect(sweep(200, params, 40).winPx).toBe(2 * sweep(200, params, 20).winPx)
    expect(timing(big, params).total).toBeGreaterThan(0)
  })
})

describe('geometry', () => {
  it('has the window, and its entry taper, off the left of the row at the start', () => {
    const g = geometry(200, params, 20, 0)
    expect(g.hiPx + params.entry * g.winPx).toBeCloseTo(0, 5)
  })
  it('has the lines, their trail included, past the end of the row at the end', () => {
    const g = geometry(200, params, 20, 1)
    expect(g.loPx - params.trail * g.winPx).toBeGreaterThanOrEqual(200 - 1e-6)
  })
  it('eases the shift to zero at both ends whatever it is', () => {
    for (const shift of [-1, -0.39, 0.7, 1]) {
      expect(geometry(200, { ...params, shift }, 20, 0).shiftNow).toBe(0)
      expect(geometry(200, { ...params, shift }, 20, 1).shiftNow).toBeCloseTo(0, 10)
      expect(geometry(200, { ...params, shift }, 20, 0.5).shiftNow).toBeCloseTo(shift, 10)
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
    const p = { ...params, stagger: 1 }
    const tm = timing(m, p)
    // Just before the first row finishes, with a stagger of 1, the second row has not begun.
    const f = frameAt(m, toned, p, (tm.durations[0] * 0.999) / tm.total)
    expect(f.rows[1].raw.every((v) => v === 0)).toBe(true)
    expect(f.rows[0].raw.some((v) => v > 0)).toBe(true)
  })

  it('draws no lines past the end of a row’s words, however wide the box is', () => {
    const wide = layout(1)
    const w = 600
    const widened: Measured = { ...wide, w, grid: { w, h: wide.h, data: new Float32Array(w * wide.h) } }
    const wordEnd = Math.max(...widened.letters.map((lt) => lt!.r))
    for (const t of [0.3, 0.6, 0.9]) {
      const f = frameAt(widened, new Float32Array(w * wide.h), { ...params, stagger: 0 }, t)
      const xs = [...f.underlay.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      // The path's numbers alternate x, y in svg units (px / UNIT_PX); every x is inside the words' extent.
      for (let i = 0; i < xs.length; i += 2) expect(xs[i] * 2).toBeLessThanOrEqual(wordEnd + 3)
    }
  })

  it('stands finished for a beat before the end: every slice solid and no lines, a little before t = 1', () => {
    const tm = timing(m, params)
    const f = frameAt(m, toned, { ...params, stagger: 0 }, 1 - 0.05 / tm.total)
    for (const row of f.rows) {
      expect(row.raw.every((v) => v === 1)).toBe(true)
      expect(row.lines.every((v) => v === 0)).toBe(true)
    }
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
