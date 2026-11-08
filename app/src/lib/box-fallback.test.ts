import { describe, expect, it } from 'vitest'
import type { BoxFallback } from '@lawfare/ragtime-client'

import {
  BOX_SEARCH,
  HUB_SEARCH,
  hubFallbackCorpora,
  hubFallbackRows,
  hubWantsFallback,
  showsFallback,
  withHubFallbackFrom,
} from './box-fallback'

const row = { id: '7', title: 'A', context: null, date: null, matched: 'both' as const, score: 1, similarity: 0.5, snippet: null }
const reply = (over: Partial<BoxFallback> = {}): BoxFallback => ({
  mode: 'hybrid',
  because: 'no_keyword_match',
  results: [row],
  ...over,
})
const onOpen = () => {}

describe('when the keyword pane shows hybrid search instead of nothing', () => {
  it('the search box asks for hybrid search', () => {
    expect(BOX_SEARCH).toEqual({ fallback: 'hybrid' })
  })

  it('a fallback with results shows', () => {
    expect(showsFallback({ reply: reply(), onOpen })).toBe(true)
  })

  it('no fallback, no results or an error keeps the empty state', () => {
    expect(showsFallback(undefined)).toBe(false)
    expect(showsFallback({ reply: undefined, onOpen })).toBe(false)
    expect(showsFallback({ reply: reply({ results: [] }), onOpen })).toBe(false)
    expect(showsFallback({ reply: reply({ error: 'hybrid search 429' }), onOpen })).toBe(false)
  })
})

describe('when Search shows hybrid search in a corpus that found nothing', () => {
  const empty = { count: 0, results: [] }
  it('Search asks for hybrid search as the search box does', () => {
    expect(HUB_SEARCH).toEqual({ fallback: 'hybrid' })
  })

  it('an empty corpus with a fallback shows its rows', () => {
    expect(hubFallbackRows({ ...empty, fallback: reply() })).toEqual([row])
  })

  it('a corpus with keyword matches, an error, or no fallback shows none', () => {
    expect(hubFallbackRows({ count: 1, results: [{ id: '1', title: 'K', context: null, date: null }], fallback: reply() })).toEqual([])
    expect(hubFallbackRows({ ...empty, error: 'timeout', fallback: reply() })).toEqual([])
    expect(hubFallbackRows({ ...empty, fallback: reply({ error: 'down', results: [] }) })).toEqual([])
    expect(hubFallbackRows(empty)).toEqual([])
    expect(hubFallbackRows(undefined)).toEqual([])
  })

  it('lists the corpora that fell back, in the reply\'s order', () => {
    const response = {
      query: 'x',
      per_corpus: { olc: { ...empty, fallback: reply() }, litigation: empty, frus: { ...empty, fallback: reply() } },
    }
    expect(hubFallbackCorpora(response)).toEqual(['olc', 'frus'])
  })
})

describe('when Search asks a second time for the closest matches', () => {
  const empty = { count: 0, results: [] }
  const hit = { count: 3, results: [{ id: '1', title: 'K', context: null, date: null }] }

  it('asks again only when a corpus that searches by meaning came back empty', () => {
    expect(hubWantsFallback({ query: 'x', per_corpus: { olc: empty, litigation: hit } })).toBe(true)
    expect(hubWantsFallback({ query: 'x', per_corpus: { olc: hit, litigation: empty } })).toBe(false)
    expect(hubWantsFallback({ query: 'x', per_corpus: { olc: { ...empty, error: 'timeout' } } })).toBe(false)
  })

  it('lays the second answer\'s fallbacks onto the first answer\'s empty corpora only', () => {
    const first = { query: 'x', per_corpus: { olc: empty, frus: hit } }
    const second = {
      query: 'x',
      per_corpus: { olc: { ...empty, fallback: reply() }, frus: { count: 4, results: [], fallback: reply() } },
    }
    const out = withHubFallbackFrom(first, second)
    expect(out.per_corpus.olc?.fallback).toEqual(reply())
    expect(out.per_corpus.frus).toBe(hit)
  })
})
