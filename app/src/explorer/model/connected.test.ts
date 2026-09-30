import { describe, expect, it } from 'vitest'

import { normalizeBrief, sameBrief } from './brief.ts'
import { CONNECTED_HEADING, connectedLabel, connectedName } from './connected.ts'
import { toolLabel, toolVerb } from './format.ts'

describe('sources connected to RAGtime', () => {
  it('labels Google Books as a connected source, and shows an unknown slug as itself', () => {
    expect(CONNECTED_HEADING).toBe('Connected to RAGtime')
    expect(connectedLabel('google_books')).toBe('Google Books — connected source, snippets only')
    expect(connectedName('google_books')).toBe('Google Books')
    expect(connectedLabel('someday_source')).toBe('someday_source')
  })

  it('keeps connected on the brief, trimmed and deduped, and leaves a brief without it byte-identical', () => {
    const b = normalizeBrief({ goal: ' g ', corpora: ['books'], answer_shape: 'a list', connected: [' google_books', 'google_books', ''] })
    expect(b.connected).toEqual(['google_books'])
    const old = normalizeBrief({ goal: 'g', corpora: ['olc'], answer_shape: 'a list' })
    expect(old).toEqual({ goal: 'g', corpora: ['olc'], answer_shape: 'a list' })
    expect(normalizeBrief({ goal: 'g', corpora: ['olc'], answer_shape: 'a list', connected: [] })).not.toHaveProperty('connected')
  })

  it('treats removing a connected source as an edit to the brief', () => {
    const withGb = { goal: 'g', corpora: ['books'], answer_shape: 'a list', connected: ['google_books'] }
    expect(sameBrief(withGb, { ...withGb, connected: [] })).toBe(false)
    expect(sameBrief(withGb, { ...withGb })).toBe(true)
  })

  it('names the Google Books round in the trail and the working indicator', () => {
    expect(toolLabel('google_books')).toBe('Google Books')
    expect(toolLabel('lookup_books')).toBe('book catalogue')
    expect(toolVerb({ name: 'google_books', input: { mode: 'quote_origin' } })).toMatch(/Google Books \(connected to RAGtime\)/)
  })
})
