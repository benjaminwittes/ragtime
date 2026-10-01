import { describe, expect, it } from 'vitest'
import { resolveEngraved } from './resolve'
import { scanFilter, sigma, type Prim } from './scan'

function blurs(prims: Prim[]): number[] {
  return prims.filter((p) => p.tag === 'feGaussianBlur').map((p) => Number(p.attrs.stdDeviation))
}

describe('scan filter', () => {
  const resolved = resolveEngraved({ params: { engraved: { scan: true, scanSpread: 0.17 } } }, {})
  const { params, scan } = resolved

  it('leaves out a blur narrower than half a device pixel and keeps a wider one', () => {
    expect(sigma(0.17, 112)).toBe(0)
    expect(sigma(0.17, 640)).toBe(0.17)
    expect(blurs(scanFilter(scan, params, 112).prims).every((s) => s === 0)).toBe(true)
    expect(blurs(scanFilter(scan, params, 640).prims).every((s) => s > 0)).toBe(true)
  })

  it('draws one blur per mask per generation', () => {
    const four = { ...scan, generations: 4 }
    expect(blurs(scanFilter(four, params, 640).prims)).toHaveLength(8)
  })

  it('gives every primitive result a name that something reads, and reads none that is not made', () => {
    const made = new Set<string>(['SourceGraphic'])
    const prims = scanFilter({ ...scan, generations: 3 }, params, 320).prims
    const walk = (list: Prim[]) => {
      for (const p of list) {
        for (const key of ['in', 'in2']) {
          const name = p.attrs[key]
          if (name !== undefined) expect(made.has(String(name)), `${p.tag} reads ${name}`).toBe(true)
        }
        if (p.attrs.result) made.add(String(p.attrs.result))
        if (p.children) walk(p.children)
      }
    }
    walk(prims)
  })
})
