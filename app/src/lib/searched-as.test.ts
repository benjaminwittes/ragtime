import { describe, expect, it } from 'vitest'
import { searchBoxLine, searchedAsLine } from './searched-as'

describe('searchedAsLine', () => {
  it('says nothing when the reading is the typed words', () => {
    expect(searchedAsLine('Youngstown', 'youngstown')).toBeNull()
    expect(searchedAsLine('  habeas   corpus ', 'habeas corpus')).toBeNull()
  })

  it('shows the reading when the grammar changed something', () => {
    expect(searchedAsLine('habeas or corpus', 'habeas corpus')).toBe('Searched as: habeas corpus')
    expect(searchedAsLine('"War Powers" AUMF OR authorization -Iraq', '"war powers" (aumf OR authorization) -iraq'))
      .toBe('Searched as: "war powers" (aumf OR authorization) -iraq')
  })

  it('explains an empty reading', () => {
    expect(searchedAsLine('the of and', '')).toMatch(/^Nothing to search/)
  })

  it('says nothing against a worker without the field', () => {
    expect(searchedAsLine('habeas or corpus', undefined)).toBeNull()
  })
})

describe('searchBoxLine', () => {
  it('reads a corpus search-box reply under the same rule', () => {
    expect(searchBoxLine('habeas or corpus', { interpreted: 'habeas corpus' })).toBe('Searched as: habeas corpus')
    expect(searchBoxLine('Habeas Corpus', { interpreted: 'habeas corpus' })).toBeNull()
    expect(searchBoxLine('the of', { interpreted: '' })).toMatch(/^Nothing to search/)
  })

  it('says nothing for a browse, or against an older worker', () => {
    expect(searchBoxLine(undefined, {})).toBeNull()
    expect(searchBoxLine('habeas or corpus', {})).toBeNull()
  })
})
