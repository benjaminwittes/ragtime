import { describe, expect, it } from 'vitest'
import { getTunable } from '@/tune/registry'
import '../../knobs'
import { DEFAULT_KNOBS } from './knobs'

/**
 * The owl's build is declared once, as knobs (`knobs/lines.ts`), and the lab keeps the same
 * numbers as constants to draw its specimens with. These hold the two to each other.
 */
describe('the owl’s build knobs', () => {
  it('default to the engine’s own numbers', () => {
    for (const [name, value] of Object.entries(DEFAULT_KNOBS)) {
      expect(getTunable('owl.lines.build.' + name)?.value, name).toBe(value)
    }
  })
})
