import { describe, expect, it } from 'vitest'
import { DEFAULT_LINE_STYLE } from './engine'
import { DEFAULT_KNOBS } from './knobs'

describe('the owl’s build knobs', () => {
  it('give the lab a number for every one the drawing takes', () => {
    for (const name of [...Object.keys(DEFAULT_LINE_STYLE), 'lines', 'pitch', 'tile']) {
      expect(typeof DEFAULT_KNOBS[name as keyof typeof DEFAULT_KNOBS], name).toBe('number')
    }
  })
})
