import { describe, expect, it } from 'vitest'
import { SNIPPET_HL_START as A, SNIPPET_HL_STOP as Z } from '@lawfare/ragtime-client'

import { snippetSegments, snippetTerms, termSegments } from './highlight'

describe('snippetSegments', () => {
  it('cuts at the delimiters', () => {
    expect(snippetSegments(`motion re ${A}vindictive prosecution${Z} denied`)).toEqual([
      { text: 'motion re ', hit: false },
      { text: 'vindictive prosecution', hit: true },
      { text: ' denied', hit: false },
    ])
  })
  it('runs an unclosed mark to the end', () => {
    expect(snippetSegments(`a ${A}b`)).toEqual([
      { text: 'a ', hit: false },
      { text: 'b', hit: true },
    ])
  })
})

describe('snippetTerms', () => {
  it('returns the distinct marked terms, longest first', () => {
    expect(snippetTerms(`${A}Prosecution${Z} for ${A}vindictive prosecution${Z}; ${A}prosecution${Z}`)).toEqual([
      'vindictive prosecution',
      'Prosecution',
    ])
  })
  it('is empty with no snippet', () => {
    expect(snippetTerms(undefined)).toEqual([])
  })
})

describe('termSegments', () => {
  it('marks every occurrence, ignoring case', () => {
    expect(termSegments('MOTION to Dismiss for Vindictive Prosecution', ['vindictive prosecution'])).toEqual([
      { text: 'MOTION to Dismiss for ', hit: false },
      { text: 'Vindictive Prosecution', hit: true },
    ])
  })
  it('matches whole words only', () => {
    expect(termSegments('statement of facts under the act', ['act'])).toEqual([
      { text: 'statement of facts under the ', hit: false },
      { text: 'act', hit: true },
    ])
  })
  it('treats a term as text, not a pattern', () => {
    expect(termSegments('18 U.S.C. 1001 (a)', ['U.S.C.'])).toEqual([
      { text: '18 ', hit: false },
      { text: 'U.S.C.', hit: true },
      { text: ' 1001 (a)', hit: false },
    ])
  })
  it('leaves text alone with no terms', () => {
    expect(termSegments('plain', [])).toEqual([{ text: 'plain', hit: false }])
  })
})
