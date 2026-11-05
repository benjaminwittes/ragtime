import { describe, expect, it } from 'vitest'

import { explorerPinnedPath, readPin } from './handoff'

describe('readPin', () => {
  it('reads one or several corpora', () => {
    expect(readPin('?pin=litigation')).toEqual(['litigation'])
    expect(readPin('?q=x&pin=olc,usc,olc')).toEqual(['olc', 'usc'])
  })
  it('is null with no pin, or nothing usable in it', () => {
    expect(readPin('')).toBeNull()
    expect(readPin('?pin=')).toBeNull()
    expect(readPin('?pin=%3Cscript%3E')).toBeNull()
    expect(readPin('?pin=a,b,c,d,e,f,g')).toBeNull()
  })
  it('round-trips the path a surface builds', () => {
    expect(readPin(explorerPinnedPath(['litigation']).split('?')[1]!)).toEqual(['litigation'])
  })
})
