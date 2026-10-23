import { describe, expect, it } from 'vitest'
import { searchedAsLine } from './searched-as'

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
