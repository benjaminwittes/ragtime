import { describe, expect, it } from 'vitest'
import { contour } from './engrave'

describe('contour', () => {
  it('draws nothing where the field is all one side of the level', () => {
    expect(contour(() => 0, 0.5, 0, 0, 10, 10, 1)).toBe('')
    expect(contour(() => 1, 0.5, 0, 0, 10, 10, 1)).toBe('')
  })

  it('finds the edge of a disc, and every segment lies near its radius', () => {
    const disc = (x: number, y: number) => (Math.hypot(x - 50, y - 50) < 20 ? 1 : 0)
    const d = contour(disc, 0.5, 20, 20, 80, 80, 1)
    const points = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
    expect(points.length).toBeGreaterThan(40)
    for (const [x, y] of points) expect(Math.abs(Math.hypot(x - 50, y - 50) - 20)).toBeLessThan(1.1)
  })
})
