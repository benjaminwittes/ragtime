import { describe, expect, it } from 'vitest'
import { qualifiedId, spokeSlugFor } from './deep-link'

describe('spokeSlugFor', () => {
  it('passes a plain corpus slug through', () => {
    expect(spokeSlugFor('olc')).toBe('olc')
    expect(spokeSlugFor('litigation')).toBe('litigation')
  })

  it('drops a collection qualifier', () => {
    expect(spokeSlugFor('congress:laws')).toBe('congress')
  })

  // The Worker registers these two as corpora of their own; the app hosts
  // them inside another spoke. Without the map a citation into either lands
  // on "not found".
  it('routes hosted corpora to the spoke that holds them', () => {
    expect(spokeSlugFor('clemency')).toBe('presidential')
    expect(spokeSlugFor('lawfare')).toBe('commentary')
  })
})

describe('qualifiedId', () => {
  it('prefixes the collection from a qualified slug', () => {
    expect(qualifiedId({ slug: 'congress:laws', id: '123' })).toBe('laws:123')
  })

  it('passes an unqualified link id through, qualified by the Worker or not', () => {
    expect(qualifiedId({ slug: 'congress', id: 'bills:75567' })).toBe('bills:75567')
    expect(qualifiedId({ slug: 'olc', id: '50' })).toBe('50')
  })
})
