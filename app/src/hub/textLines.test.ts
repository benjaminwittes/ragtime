import { describe, expect, it } from 'vitest'
import { gridField, linesFromGrid, UNIT_PX, type Grid } from './textLines'

const grid = (w: number, h: number, ink: (x: number, y: number) => number): Grid => {
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = ink(x, y)
  return { w, h, data }
}

describe('type as lines', () => {
  it('reads a grid in engine units, two pixels to the unit', () => {
    const g = grid(20, 20, (x) => (x < 10 ? 1 : 0))
    const f = gridField(g)
    expect(f(2, 5)).toBeCloseTo(1, 1)
    expect(f(8, 5)).toBeCloseTo(0, 1)
    expect(UNIT_PX).toBe(2)
  })

  it('draws nothing for paper and something for ink', () => {
    expect(linesFromGrid(grid(120, 40, () => 0), 2)).toBe('')
    expect(linesFromGrid(grid(120, 40, (x, y) => (x > 20 && x < 100 && y > 10 && y < 30 ? 1 : 0)), 2).length).toBeGreaterThan(100)
  })

  it('draws more ink where there is more', () => {
    const solid = linesFromGrid(grid(120, 40, (x, y) => (x > 20 && x < 100 && y > 8 && y < 32 ? 1 : 0)), 2)
    const thin = linesFromGrid(grid(120, 40, (x, y) => (x > 20 && x < 100 && y > 18 && y < 22 ? 1 : 0)), 2)
    expect(solid.length).toBeGreaterThan(thin.length)
  })
})
