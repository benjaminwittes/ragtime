import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Owl } from '../Owl'
import { baseDesign } from '../design'
import { enabledStanding, loadStandingKit, resolveStanding, wantsStanding } from './index'

/**
 * The owl as sent has nothing standing, so none of the code that stands is in the page that
 * carries it. These pin what that split has to keep: a design that asks for nothing standing
 * is the design it was, whether or not anything has been fetched; one that asks for some is
 * left as it is until the standing code arrives, and draws its first frame without it; and
 * once it has arrived the same design is worked out as it always was.
 *
 * This file must not import `./core/all`, which would hand the code to the registry before
 * the first tests ask what happens without it.
 */

describe('before the standing code is fetched', () => {
  it('hands a design that asks for nothing standing back as the same object', () => {
    const base = baseDesign()
    expect(wantsStanding(base, {})).toBe(false)
    expect(wantsStanding(base, { 'owl.design.palette.navy': '#000' })).toBe(false)
    expect(resolveStanding(base, {})).toBe(base)
    expect(resolveStanding(base, { 'owl.standing.temperament': 'inherit' })).toBe(base)
  })

  it('leaves a design that asks for standing as it is, with nothing on', () => {
    const base = baseDesign()
    expect(wantsStanding(base, { 'owl.standing.temperament': 'print' })).toBe(true)
    expect(resolveStanding(base, { 'owl.standing.temperament': 'print' })).toBe(base)
  })

  it('draws the first frame of an owl that stands without the attribute', () => {
    expect(renderToStaticMarkup(<Owl variant="engraved-copy" />)).not.toContain('data-standing')
  })

  it('draws the default owl with no standing attribute at all', () => {
    expect(renderToStaticMarkup(<Owl />)).not.toContain('data-standing')
  })
})

describe('once the standing code has arrived', () => {
  it('has the code to run, and the rules', async () => {
    const kit = await loadStandingKit()
    expect(typeof kit.start).toBe('function')
    expect(typeof kit.update).toBe('function')
    expect(kit.standingIds().has('breathe')).toBe(true)
  })

  it('works a temperament out to the behaviours it switches on', () => {
    const out = resolveStanding(baseDesign(), { 'owl.standing.temperament': 'print' })
    expect(enabledStanding(out.standing)).toContain('boil')
  })

  it('ignores an id that is not a behaviour, as before', () => {
    expect(resolveStanding(baseDesign(), { 'owl.standing.ghost.on': 'on' }).standing).toEqual({})
  })

  it('draws the owl that stands with its attribute on the first frame', () => {
    const html = renderToStaticMarkup(<Owl variant="engraved-copy" />)
    expect(html).toContain('data-standing="')
    expect(html).toContain('boil')
  })
})
