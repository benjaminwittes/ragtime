import { describe, expect, it } from 'vitest'
import { links } from './links'

// The grammar has two emitters (the Worker's Explorer handoffs and the client
// package's `links`) and one reader (this module's `parse`, which the app's
// router and the spoke shells read through). The pins below are the same ones
// the client package carries, ported to vitest: if either copy drifts, one
// suite goes red before a handoff link lands on a "not found" page.

describe('workspace', () => {
  it('writes byte-for-byte what the Worker writes for the same inputs', () => {
    // The Worker's search handoff: "/corpus/" + slug + "?q=" + encodeURIComponent(q)
    expect(links.workspace({ slug: 'olc', q: 'President remove head' })).toBe(
      '/corpus/olc?q=President%20remove%20head',
    )
    // The Worker's filter handoff: "?ids=" + encodeURIComponent(ids.join(",")) + "&mode=manual_filter"
    expect(links.workspace({ slug: 'olc', ids: [1, 2, 3], mode: 'manual_filter' })).toBe(
      '/corpus/olc?ids=1%2C2%2C3&mode=manual_filter',
    )
    expect(links.workspace({ slug: 'fr' })).toBe('/corpus/fr')
  })

  it('repeats facet parameters in the order given, after q and before ids', () => {
    const url = links.workspace({
      slug: 'litigation',
      q: 'habeas',
      facets: { court: ['dcd', 'ca9'], year: '2025' },
      ids: ['a'],
      mode: 'claude_ama',
    })
    expect(url).toBe('/corpus/litigation?q=habeas&court=dcd&court=ca9&year=2025&ids=a&mode=claude_ama')
  })

  it('refuses reserved names, bad slugs, bad ids and bad modes', () => {
    expect(() => links.workspace({ slug: 'olc', facets: { q: 'x' } })).toThrow(/reserved/)
    expect(() => links.workspace({ slug: 'olc', facets: { mode: 'x' } })).toThrow(/reserved/)
    expect(() => links.workspace({ slug: 'OLC' })).toThrow(/slug/)
    expect(() => links.workspace({ slug: 'olc/../x' })).toThrow(/slug/)
    expect(() => links.workspace({ slug: 'olc', ids: ['a b'] })).toThrow(/document id/)
    expect(() => links.workspace({ slug: 'olc', mode: 'bogus' as never })).toThrow(/mode/)
  })
})

describe('document and the citation form', () => {
  it('writes /corpus/:slug/:id and resolves rt:// to it', () => {
    expect(links.document({ slug: 'olc', id: 50 })).toBe('/corpus/olc/50')
    expect(links.document({ slug: 'congress:laws', id: 'PL-118-31' })).toBe('/corpus/congress:laws/PL-118-31')
    expect(links.fromCitation('rt://olc/50')).toBe('/corpus/olc/50')
    expect(links.fromCitation(' rt://fr/2025-01234 ')).toBe('/corpus/fr/2025-01234')
    expect(links.parseCitation('rt://olc/50')).toEqual({ slug: 'olc', id: '50' })
    expect(links.parseCitation('https://example.org/olc/50')).toBeNull()
    expect(links.parseCitation('rt://olc/')).toBeNull()
    expect(() => links.fromCitation('/corpus/olc/50')).toThrow(/citation/)
  })
})

describe('parse', () => {
  it('is the inverse of workspace and document', () => {
    expect(links.parse(links.workspace({ slug: 'olc', q: 'President remove head' }))).toEqual({
      slug: 'olc',
      facets: {},
      q: 'President remove head',
    })
    expect(links.parse(links.workspace({ slug: 'olc', ids: [1, 2, 3], mode: 'manual_filter' }))).toEqual({
      slug: 'olc',
      facets: {},
      ids: ['1', '2', '3'],
      mode: 'manual_filter',
    })
    expect(
      links.parse(
        links.workspace({
          slug: 'litigation',
          q: 'habeas',
          facets: { court: ['dcd', 'ca9'], year: '2025' },
          mode: 'claude_ama',
        }),
      ),
    ).toEqual({ slug: 'litigation', q: 'habeas', facets: { court: ['dcd', 'ca9'], year: ['2025'] }, mode: 'claude_ama' })
    expect(links.parse('/corpus/olc/50')).toEqual({ slug: 'olc', id: '50', facets: {} })
    expect(links.parse(links.fromCitation('rt://congress:laws/PL-118-31'))).toEqual({
      slug: 'congress:laws',
      id: 'PL-118-31',
      facets: {},
    })
  })

  it('reads absolute URLs, drops an unknown mode, and returns null off the grammar', () => {
    expect(links.parse('https://ragtime.lawfaremedia.org/corpus/fr?q=a&agency=EPA&agency=DOJ&mode=bogus')).toEqual({
      slug: 'fr',
      q: 'a',
      facets: { agency: ['EPA', 'DOJ'] },
    })
    expect(links.parse('/')).toBeNull()
    expect(links.parse('/corpus')).toBeNull()
    expect(links.parse('/corpus/OLC')).toBeNull()
    expect(links.parse('/about?q=x')).toBeNull()
    expect(links.parse('not a url at all')).toBeNull()
  })

  // The hub's existing carryover is `?q=` on the workspace path; the grammar
  // must keep reading it exactly as `readCarryoverQuery` always has.
  it('keeps the hub carryover working unchanged', () => {
    expect(links.parse('/corpus/litigation?q=habeas%20corpus')).toEqual({
      slug: 'litigation',
      q: 'habeas corpus',
      facets: {},
    })
    expect(links.parse('/corpus/litigation?q=')).toEqual({ slug: 'litigation', facets: {} })
  })
})
