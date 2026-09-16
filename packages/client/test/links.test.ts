import { test } from 'node:test'
import assert from 'node:assert/strict'

import { links } from '../src/links.ts'

test('workspace writes byte-for-byte what the worker writes for the same inputs', () => {
  // The worker's search handoff: "/corpus/" + slug + "?q=" + encodeURIComponent(q)
  assert.equal(links.workspace({ slug: 'olc', q: 'President remove head' }), '/corpus/olc?q=President%20remove%20head')
  // The worker's filter handoff: "?ids=" + encodeURIComponent(ids.join(",")) + "&mode=manual_filter"
  assert.equal(links.workspace({ slug: 'olc', ids: [1, 2, 3], mode: 'manual_filter' }), '/corpus/olc?ids=1%2C2%2C3&mode=manual_filter')
  assert.equal(links.workspace({ slug: 'fr' }), '/corpus/fr')
})

test('facets repeat the parameter, in the order given, after q and before ids', () => {
  const url = links.workspace({ slug: 'litigation', q: 'habeas', facets: { court: ['dcd', 'ca9'], year: '2025' }, ids: ['a'], mode: 'claude_ama' })
  assert.equal(url, '/corpus/litigation?q=habeas&court=dcd&court=ca9&year=2025&ids=a&mode=claude_ama')
})

test('reserved names, bad slugs, bad ids and bad modes are refused', () => {
  assert.throws(() => links.workspace({ slug: 'olc', facets: { q: 'x' } }), /reserved/)
  assert.throws(() => links.workspace({ slug: 'olc', facets: { mode: 'x' } }), /reserved/)
  assert.throws(() => links.workspace({ slug: 'OLC' }), /slug/)
  assert.throws(() => links.workspace({ slug: 'olc/../x' }), /slug/)
  assert.throws(() => links.workspace({ slug: 'olc', ids: ['a b'] }), /document id/)
  assert.throws(() => links.workspace({ slug: 'olc', mode: 'bogus' as never }), /mode/)
})

test('document and the citation form', () => {
  assert.equal(links.document({ slug: 'olc', id: 50 }), '/corpus/olc/50')
  assert.equal(links.document({ slug: 'congress:laws', id: 'PL-118-31' }), '/corpus/congress:laws/PL-118-31')
  assert.equal(links.fromCitation('rt://olc/50'), '/corpus/olc/50')
  assert.equal(links.fromCitation(' rt://fr/2025-01234 '), '/corpus/fr/2025-01234')
  assert.deepEqual(links.parseCitation('rt://olc/50'), { slug: 'olc', id: '50' })
  assert.equal(links.parseCitation('https://example.org/olc/50'), null)
  assert.equal(links.parseCitation('rt://olc/'), null)
  assert.throws(() => links.fromCitation('/corpus/olc/50'), /citation/)
})

test('parse is the inverse of workspace and document', () => {
  assert.deepEqual(links.parse(links.workspace({ slug: 'olc', q: 'President remove head' })), { slug: 'olc', facets: {}, q: 'President remove head' })
  assert.deepEqual(links.parse(links.workspace({ slug: 'olc', ids: [1, 2, 3], mode: 'manual_filter' })), { slug: 'olc', facets: {}, ids: ['1', '2', '3'], mode: 'manual_filter' })
  assert.deepEqual(
    links.parse(links.workspace({ slug: 'litigation', q: 'habeas', facets: { court: ['dcd', 'ca9'], year: '2025' }, mode: 'claude_ama' })),
    { slug: 'litigation', q: 'habeas', facets: { court: ['dcd', 'ca9'], year: ['2025'] }, mode: 'claude_ama' },
  )
  assert.deepEqual(links.parse('/corpus/olc/50'), { slug: 'olc', id: '50', facets: {} })
  assert.deepEqual(links.parse(links.fromCitation('rt://congress:laws/PL-118-31')), { slug: 'congress:laws', id: 'PL-118-31', facets: {} })
})

test('parse reads absolute URLs, drops an unknown mode, and returns null off the grammar', () => {
  assert.deepEqual(links.parse('https://ragtime.lawfaremedia.org/corpus/fr?q=a&agency=EPA&agency=DOJ&mode=bogus'), {
    slug: 'fr',
    q: 'a',
    facets: { agency: ['EPA', 'DOJ'] },
  })
  assert.equal(links.parse('/'), null)
  assert.equal(links.parse('/corpus'), null)
  assert.equal(links.parse('/corpus/OLC'), null)
  assert.equal(links.parse('/about?q=x'), null)
  assert.equal(links.parse('not a url at all'), null)
})
