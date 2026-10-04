import { describe, expect, it } from 'vitest'
import { OWLS, earAt, owlField, tiltAt } from './owls'

describe('line-tile owls', () => {
  it('stay in 0..1 and put ink on the body and none off the page', () => {
    for (const spec of OWLS) {
      const f = owlField(spec, 0, 'lit')
      expect(f(50, 70)).toBeGreaterThan(0.1)
      expect(f(2, 2)).toBe(0)
      for (let y = 0; y <= 100; y += 7) for (let x = 0; x <= 100; x += 7) {
        const v = f(x, y)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
  it('shuts the eye ring to ink and tips the head only now and then', () => {
    const spec = OWLS[2]
    const open = owlField(spec, 0, 'lit')(50 + spec.eyeX, spec.eyeY - spec.eyeR * 0.5)
    const shut = owlField(spec, 5.5 * 0.78, 'lit')(50 + spec.eyeX, spec.eyeY - spec.eyeR * 0.5)
    expect(shut).not.toBeCloseTo(open, 1)
    expect(tiltAt(0)).toBe(0)
    expect(tiltAt(13 * 0.475)).toBeGreaterThan(0.1)
    expect(earAt(0)).toBe(0)
  })
})
