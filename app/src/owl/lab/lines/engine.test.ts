import { describe, expect, it } from 'vitest'
import { computeLines, DEFAULT_LINE_STYLE, eyeOpen, gaussKernel, glowAt, presetFor, snapGaps, smoothstep } from './engine'

const params = (size: number) => ({
  ...DEFAULT_LINE_STYLE,
  ...presetFor(size),
  size,
  bounds: { x0: 0, y0: 0, x1: 100, y1: 100 },
})

describe('line-tile engine', () => {
  it('normalises its kernel and smooths both ways', () => {
    const k = gaussKernel(2)
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(1, 0, 0.5)).toBeCloseTo(0.5)
  })

  it('draws nothing for paper and something for ink', () => {
    expect(computeLines(() => 0, params(112)).d).toBe('')
    const { d, stats } = computeLines(() => 1, params(112))
    expect(d.startsWith('M')).toBe(true)
    expect(stats.lines % 5).toBe(0)
  })

  it('closes a sliver between two thick lines and leaves a real gap alone', () => {
    const [a, b] = snapGaps([1, 0.9, 0.1], 0.3)
    expect(a).toBeGreaterThan(1)
    expect(b).toBeGreaterThan(0.9)
    expect(snapGaps([0.3, 0.3], 0.3)).toEqual([0.3, 0.3])
  })

  it('blinks briefly and glows by state', () => {
    expect(eyeOpen(0)).toBe(1)
    expect(eyeOpen(5.5 * 0.78)).toBeLessThan(0.1)
    expect(glowAt(1, 'dark')).toBe(0)
    expect(glowAt(1, 'lit')).toBeGreaterThan(0.8)
  })
})
