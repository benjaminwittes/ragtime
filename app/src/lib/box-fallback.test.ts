import { describe, expect, it } from 'vitest'
import type { BoxFallback } from '@lawfare/ragtime-client'

import { BOX_SEARCH, showsFallback } from './box-fallback'

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
