import { describe, expect, it } from 'vitest'
import { baseDesign } from '../design'
import { resolveDesign } from '../resolve'
import { searchVars } from '../vars'
import { getVariant } from '../variants'
import { resolveStanding } from './index'
import { getStanding, standingList } from './core/all'
import { cycle, stepify, track } from './core/frames'
import { gap, hashSeed, seeded } from './core/rng'
import { standingConfigs } from './core/resolve'
import { temperamentList } from '../temperaments'

describe('resolveStanding', () => {
  const base = baseDesign()

  it('leaves the base owl as the same object, with nothing standing', () => {
    expect(resolveStanding(base, {})).toBe(base)
    expect(resolveStanding(base, { 'owl.standing.temperament': 'inherit' })).toBe(base)
  })

  it('switches on what a temperament lists, at its amount and period', () => {
    const out = resolveStanding(base, { 'owl.standing.temperament': 'still' })
    expect(out.standing).toEqual({ breathe: true })
    expect(out.params.standing['breathe.amount']).toBe(0.5)
    // A multiple of the behaviour's own period, turned into seconds where it is in hand.
    expect(out.params.standing['breathe.period']).toBeCloseTo(1.4)
    expect(standingConfigs(out, false, (id) => getStanding(id)!.period).breathe.period).toBeCloseTo(
      getStanding('breathe')!.period * 1.4,
    )
  })

  it('lets a switch and a multiplier win over the temperament', () => {
    const out = resolveStanding(base, {
      'owl.standing.temperament': 'still',
      'owl.standing.breathe.on': 'off',
      'owl.standing.sway.on': 'on',
      'owl.standing.sway.amount': 2,
    })
    expect(out.standing).toEqual({ sway: true })
    expect(out.params.standing['sway.amount']).toBe(2)
  })

  it('has a master switch', () => {
    const owl = resolveStanding(base, { 'owl.standing.temperament': 'watchful', 'owl.standing.master': false })
    expect(owl.standing).toEqual({})
  })

  it('takes a variant’s temperament, and the panel’s wins over it', () => {
    const copy = resolveDesign(base, [getVariant('engraved-copy')?.design], {})
    expect(resolveStanding(copy, {}).standing['boil']).toBe(true)
    expect(resolveStanding(copy, { 'owl.standing.temperament': 'none' }).standing).toEqual({})
  })

  it('steps only where asked: print always, others under the scan', () => {
    const print = resolveStanding(base, { 'owl.standing.temperament': 'print' })
    expect(standingConfigs(print, false, () => 1).breathe.fps).toBe(10)
    const calm = resolveStanding(base, { 'owl.standing.temperament': 'still' })
    expect(standingConfigs(calm, false, () => 1).breathe.fps).toBe(0)
    expect(standingConfigs(calm, true, () => 1).breathe.fps).toBe(10)
  })
})

describe('the registries', () => {
  it('every temperament lists only behaviours that exist', () => {
    for (const t of temperamentList()) {
      for (const id of Object.keys(t.behaviours)) expect(getStanding(id), `${t.id}/${id}`).toBeDefined()
    }
  })
  it('has the base variant name no temperament', () => {
    expect(baseDesign().temperament).toBeNull()
    expect(standingList().length).toBeGreaterThan(10)
  })
})

describe('keyframes and chance', () => {
  it('closes a cycle on its first sample', () => {
    const frames = cycle((t) => ({ opacity: t }), 4)
    expect(frames).toHaveLength(5)
    expect(frames[4].opacity).toBe(0)
  })
  it('steps each segment by the rate', () => {
    const out = stepify([{ offset: 0 }, { offset: 0.5 }, { offset: 1 }], 4, 10)
    expect(out[0].easing).toBe('steps(20)')
  })
  it('turns beats into offsets', () => {
    const t = track([[0, { opacity: 0 }], [500, { opacity: 1 }], [1000, { opacity: 0 }]])
    expect(t.duration).toBe(1000)
    expect(t.frames[1].offset).toBe(0.5)
  })
  it('replays the same draws for the same seed, and spreads gaps around the mean', () => {
    const a = seeded(hashSeed('x', 3))
    const b = seeded(hashSeed('x', 3))
    expect([a(), a()]).toEqual([b(), b()])
    expect(gap(10, 0.5, 0)).toBe(5)
    expect(gap(10, 0.5, 1)).toBe(15)
  })
})

describe('searchVars', () => {
  it('writes the three searching knobs', () => {
    expect(searchVars((id) => ({ 'owl.search.swing': 4, 'owl.search.scan': 1, 'owl.search.lift': 1.2 })[id])).toEqual({
      '--owl-search-swing': '4deg',
      '--owl-search-scan': '1',
      '--owl-search-lift': '1.2',
    })
  })
})
