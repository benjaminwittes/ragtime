import { describe, expect, it } from 'vitest'
import { getTunable } from '@/tune/registry'
import './knobs'
import { SITES, siteVars, sizeKnob, sizeSmKnob, variantKnob } from './embeds'
import type { OwlSiteId } from './types'

const ids = Object.keys(SITES) as OwlSiteId[]

describe('the embed table', () => {
  it('is the six places the owl is mounted', () => {
    expect(ids.sort()).toEqual(['explorer', 'gate', 'hub', 'not-found', 'record', 'stage'])
  })

  it('has a size knob and a variant knob for every site', () => {
    for (const id of ids) {
      expect(getTunable(sizeKnob(id)), id).toBeDefined()
      expect(getTunable(variantKnob(id))?.value, id).toBe('inherit')
    }
  })

  it('has a second size wherever a class reads one', () => {
    for (const id of ids) {
      const reads = (SITES[id].figureClassName ?? '').includes('--owl-size-sm') || SITES[id].className.includes('--owl-size-sm')
      expect(getTunable(sizeSmKnob(id)) !== undefined, id).toBe(reads)
    }
  })

  it('sizes the element that carries the width from the knob', () => {
    for (const id of ids) {
      const carrier = SITES[id].figureClassName ?? SITES[id].className
      // The Explorer's width is written in its own sheet, from the same property.
      if (id !== 'explorer') expect(carrier, id).toContain('var(--owl-size)')
    }
  })

  it('keeps the poses the pages gave the owl', () => {
    expect(SITES.hub.pose).toBe('stacks')
    for (const id of ids.filter((i) => i !== 'hub')) expect(SITES[id].pose, id).toBe('archivist')
  })
})

describe('siteVars', () => {
  it('reads the knobs of one site', () => {
    const values: Record<string, string> = {
      'owl.embed.hub.size': '5.5rem',
      'owl.embed.hub.sizeSm': '7rem',
      'owl.embed.gate.size': '4rem',
    }
    expect(siteVars('hub', (k) => values[k])).toEqual({ '--owl-size': '5.5rem', '--owl-size-sm': '7rem' })
    expect(siteVars('gate', (k) => values[k])).toEqual({ '--owl-size': '4rem' })
  })

  it('writes the defaults the pages used to hard-code', () => {
    const read = (k: string) => getTunable(k)?.value
    expect(siteVars('hub', read)).toEqual({ '--owl-size': '5.5rem', '--owl-size-sm': '10.25rem' })
    expect(siteVars('explorer', read)).toEqual({ '--owl-size': '56px' })
    expect(siteVars('gate', read)).toEqual({ '--owl-size': '4rem' })
    expect(siteVars('not-found', read)).toEqual({ '--owl-size': '5rem' })
    expect(siteVars('stage', read)).toEqual({ '--owl-size': '6rem' })
    expect(siteVars('record', read)).toEqual({ '--owl-size': 'clamp(3rem,5.2cqi,4.75rem)' })
  })
})
