import { describe, expect, it } from 'vitest'
import { baseDesign } from '../../design'
import { buildPlate, adaptParams } from './plate'
import { resolveEngraved } from './resolve'

const design = baseDesign()

function plate(overrides: Record<string, string | number | boolean> = {}, px = 320, pose: 'archivist' | 'stacks' = 'archivist') {
  const { params } = resolveEngraved({ params: { engraved: overrides } }, {})
  return buildPlate({ pose: design.poses[pose], shape: design.shape, palette: design.palette, params, px })
}

describe('plate', () => {
  it('prints something for every region of the owl, in both poses', () => {
    for (const pose of ['archivist', 'stacks'] as const) {
      const p = plate({}, 320, pose)
      const ids = p.groups.map((g) => g.id)
      for (const id of ['body', 'head', 'face', 'belly', 'wing-l', 'wing-r', 'beak', 'lantern', 'flame']) {
        expect(ids).toContain(id)
      }
      expect(ids.includes('books')).toBe(pose === 'stacks')
      for (const g of p.groups.filter((x) => ['body', 'head', 'face'].includes(x.id))) {
        expect(g.screen.length, g.id).toBeGreaterThan(200)
      }
    }
  })

  it('draws the same plate for the same settings, and a different one for another seed', () => {
    const a = plate()
    const b = plate()
    expect(b).toBe(a)
    const c = plate({ seed: 8 })
    expect(c.groups.map((g) => g.screen).join()).not.toBe(a.groups.map((g) => g.screen).join())
  })

  it('moves with every parameter that claims to', () => {
    const base = plate()
    const text = (p: typeof base) => p.groups.map((g) => g.screen + g.hatch + g.key + g.keyWidth).join('|')
    const knobs: Record<string, string | number | boolean>[] = [
      { screen: 'contour' },
      { screen: 'straight' },
      { screen: 'mixed' },
      { pitch: 2.4 },
      { angle: 20 },
      { fan: 0 },
      { contourPitch: 2.6, screen: 'contour' },
      { wmin: 0.3 },
      { wmax: 0.6 },
      { floor: 0.3 },
      { breakAt: 0.5 },
      { dash: 5 },
      { hatch: 0.5 },
      { hatch: 1 },
      { hatchAngle: 20 },
      { hatchWeight: 1 },
      { waver: 0.5 },
      { gamma: 1.6 },
      { contrast: 2 },
      { brightness: 0.2 },
      { grain: 0.4 },
      { light: 45 },
      { model: 2 },
      { edge: 0.8 },
      { shadow: 0.9 },
      { displace: 6 },
      { keyline: 1.2 },
      { ground: 'none' },
      { ground: 'paper' },
      { fidelity: 'fine' },
    ]
    for (const k of knobs) expect(text(plate(k)), JSON.stringify(k)).not.toBe(text(base))
    // Thirty-one full-size plates: about 0.4 s alone, but it was seen to pass the 5 s default
    // on a machine busy with other work. Small sizes cannot stand in, because
    // coarsening there hides some knobs on purpose.
  }, 30_000)

  it('coarsens a small figure: fewer, heavier lines, no cross-hatch', () => {
    const big = plate({}, 320)
    const small = plate({}, 56)
    expect(small.coarsening).toBeGreaterThan(1.5)
    expect(small.stats.bytes).toBeLessThan(big.stats.bytes / 3)
    expect(small.groups.every((g) => g.hatch === '')).toBe(true)
    const off = adaptParams({ ...resolveEngraved({ params: {} }, {}).params, adapt: false }, 56)
    expect(off.coarsening).toBe(1)
  })

  it('keeps its path data and time inside a budget at the sizes the owl is drawn', () => {
    const cold = plate({ seed: 31 }, 320)
    expect(cold.stats.bytes).toBeLessThan(120_000)
    expect(cold.stats.ms).toBeLessThan(1500)
    for (const px of [56, 112, 224]) {
      expect(plate({ seed: 32 }, px).stats.bytes).toBeLessThan(120_000)
    }
  })

  it('leaves a clear highlight: not every sample of a lit shape carries ink', () => {
    const p = plate({ hatch: 1, keyline: 0 })
    const belly = p.groups.find((g) => g.id === 'belly')
    const body = p.groups.find((g) => g.id === 'body')
    expect(belly?.screen.length).toBeLessThan((body?.screen.length ?? 0) / 2)
  })
})
