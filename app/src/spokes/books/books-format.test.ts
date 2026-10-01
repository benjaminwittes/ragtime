import { describe, it, expect } from 'vitest'
import type { BooksFacets } from '@lawfare/ragtime-client'
import {
  booksDisclosure,
  booksEmptyHint,
  formatMillions,
  snapshotPhrase,
  coverageHint,
  coveragePercent,
  describeFields,
  displayAuthors,
  displayTitle,
  displayYear,
  editionCounts,
  fieldsFromDeepLink,
  firstIsbn,
  formatBooksCount,
  googleBooksLink,
  handoffLadder,
  languageName,
} from './books-format'

// Fixtures are shaped like ragtime-worker#145's BOOKS_DISPLAY_COLS row.
const goldsmith = {
  title: 'The terror presidency :',
  subtitle: 'law and judgment inside the Bush administration /',
  authors: ['Goldsmith, Jack L.'],
  isbn: ['9780393065503 (hardcover)', '0393065502 (hardcover)'],
  lccn_normalized: '2007024871',
}

describe('formatBooksCount', () => {
  it('marks a floor with a plus — the Worker stopped counting there', () => {
    expect(formatBooksCount(10000, true)).toBe('10,000+ records')
  })
  it('prints an exact count as-is', () => {
    expect(formatBooksCount(84, false)).toBe('84 records')
    expect(formatBooksCount(1, false)).toBe('1 record')
  })
})

describe('coverage', () => {
  const audience = { present: 406644, total: 10543015 }
  it('shows a sparse field to one decimal', () => {
    expect(coveragePercent(audience)).toBe('3.9%')
  })
  it('rounds a dense field to a whole percent', () => {
    expect(coveragePercent({ present: 9404370, total: 10543015 })).toBe('89%')
    expect(coveragePercent({ present: 10543015, total: 10543015 })).toBe('100%')
  })
  it('gives the denominator in the hint', () => {
    expect(coverageHint(audience)).toBe(
      'coded on 3.9% of records (406,644 of 10,543,015) — the rest are invisible to this filter',
    )
  })
  it('has no hint for a field every record carries', () => {
    expect(coverageHint({ present: 10543015, total: 10543015 })).toBe(null)
  })
  it('says nothing rather than guess when coverage is unknown', () => {
    expect(coveragePercent(undefined)).toBe(null)
    expect(coverageHint({ present: 0, total: 0 })).toBe(null)
  })
})

describe('display', () => {
  it('drops MARC punctuation from names and titles', () => {
    expect(displayAuthors({ authors: ['Wittes, Benjamin.', 'Brookings Institution,'] })).toEqual([
      'Wittes, Benjamin',
      'Brookings Institution',
    ])
    expect(displayTitle(goldsmith)).toBe(
      'The terror presidency: law and judgment inside the Bush administration',
    )
    expect(displayTitle({ title: null, subtitle: null })).toBe('(no title)')
  })
  it('prefers the normalised year and falls back to the record', () => {
    expect(displayYear({ pub_date: 'c2007.', pub_date_normalized: 2007 })).toBe('2007')
    expect(displayYear({ pub_date: '[18--?].', pub_date_normalized: null })).toBe('[18--?]')
    expect(displayYear({ pub_date: null, pub_date_normalized: null })).toBe(null)
  })
  it('names common languages and passes others through', () => {
    expect(languageName('ger')).toBe('German')
    expect(languageName('xyz')).toBe('xyz')
    expect(languageName(null)).toBe(null)
  })
})

describe('firstIsbn', () => {
  it('strips qualifiers and hyphens', () => {
    expect(firstIsbn(goldsmith)).toBe('9780393065503')
    expect(firstIsbn({ isbn: ['0-674-03004-x (alk. paper)'] })).toBe('067403004X')
  })
  it('returns null when nothing on the record is an ISBN', () => {
    expect(firstIsbn({ isbn: ['(pbk.)'] })).toBe(null)
    expect(firstIsbn({ isbn: null })).toBe(null)
  })
})

describe('handoffLadder', () => {
  it('puts the LOC entry first and a library after it', () => {
    const l = handoffLadder(goldsmith, { locPermalink: 'https://lccn.loc.gov/2007024871' })
    expect(l.map((h) => h.key)).toEqual(['loc', 'worldcat'])
    expect(l[1].href).toBe('https://search.worldcat.org/search?q=bn%3A9780393065503')
  })
  it('builds the LOC permalink from the LCCN when the record response has none', () => {
    expect(handoffLadder(goldsmith, {})[0].href).toBe('https://lccn.loc.gov/2007024871')
  })
  it('offers free full text only when the work is likely public domain', () => {
    const old = { title: 'The federalist :', subtitle: null, authors: ['Hamilton, Alexander,'], isbn: null, lccn_normalized: null }
    const l = handoffLadder(old, { likelyPublicDomain: true })
    expect(l.map((h) => h.key)).toEqual(['hathitrust', 'internet-archive', 'worldcat'])
    expect(l[0].href).toContain('q1=The%20federalist%20Hamilton%2C%20Alexander')
    expect(handoffLadder(old, { likelyPublicDomain: false }).map((h) => h.key)).toEqual(['worldcat'])
  })
})

describe('googleBooksLink', () => {
  it('resolves an ISBN to the volume', () => {
    expect(googleBooksLink(goldsmith)?.href).toBe('https://books.google.com/books?vid=ISBN9780393065503')
  })
  it('says it is only a search when there is no ISBN', () => {
    const g = googleBooksLink({ ...goldsmith, isbn: null })
    expect(g?.label).toBe('Search Google Books')
    expect(g?.href).toMatch(/^https:\/\/www\.google\.com\/search\?tbm=bks&q=/)
  })
})

describe('editionCounts', () => {
  it('counts shared cluster keys within the fetched rows only', () => {
    const m = editionCounts([
      { work_cluster_key: 'don quixote|cervantes' },
      { work_cluster_key: 'don quixote|cervantes' },
      { work_cluster_key: 'solo|someone' },
      { work_cluster_key: null },
    ])
    expect([...m]).toEqual([['don quixote|cervantes', 2]])
  })
})

describe('fieldsFromDeepLink', () => {
  it('maps the Worker vocabulary and parses numbers and flags', () => {
    expect(
      fieldsFromDeepLink('lincoln', {
        subject: ['Lincoln, Abraham'],
        pagesMax: ['300'],
        illustrated: ['true'],
        likelyPublicDomain: ['false'],
        bogus: ['x'],
        yearFrom: ['not-a-year'],
      }),
    ).toEqual({ search: 'lincoln', subject: 'Lincoln, Abraham', pagesMax: 300, illustrated: true })
  })
  it('is null when there is nothing to filter on', () => {
    expect(fieldsFromDeepLink(undefined, {})).toBe(null)
  })
})

describe('describeFields', () => {
  it('names what was asked', () => {
    expect(describeFields({ author: 'Goldsmith, Jack', illustrated: true })).toBe(
      'author: Goldsmith, Jack · illustrated',
    )
    expect(describeFields({})).toBe('(no filter)')
  })
})

describe('derived prose', () => {
  it('formats a record count in millions', () => {
    expect(formatMillions(10_543_015)).toBe('10.5 million')
    expect(formatMillions(84_000)).toBe('84,000')
  })
  it('reads the snapshot year from facets, and names none it does not know', () => {
    expect(snapshotPhrase(2016)).toBe('a 2016 snapshot')
    expect(snapshotPhrase(undefined)).toBe('a snapshot')
    expect(booksEmptyHint(undefined)).not.toMatch(/\d{4}/)
  })
  it('carries no figure in the disclosure until facets arrive', () => {
    expect(booksDisclosure(undefined)).not.toMatch(/\d/)
    const f = { record_count: 10_543_015, source_vintage: 2016 } as BooksFacets
    expect(booksDisclosure(f)).toContain('10.5 million books')
    expect(booksDisclosure(f)).toContain('snapshot of 2016')
  })
})
