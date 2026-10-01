import { describe, expect, it } from 'vitest'
import { baseDesign } from './design'
import { motionVars } from './vars'

describe('motionVars', () => {
  it('writes the default motion as the values owl.css had hard-coded', () => {
    expect(motionVars(baseDesign().motion)).toEqual({
      '--owl-blink-period': '6.5s',
      '--owl-blink-closed': '0.08',
      '--owl-gaze-ease': '140ms',
      '--owl-gaze-travel': '0.33',
      '--owl-glow-lit': '0.7',
      '--owl-glow-fade': '500ms',
      '--owl-search-period': '1.1s',
      '--owl-search-low': '0.35',
      '--owl-search-high': '1',
      '--owl-shake-time': '420ms',
      '--owl-shake-reach': '4px',
    })
  })

  it('follows the design it is given', () => {
    const vars = motionVars({ ...baseDesign().motion, blinkPeriod: 11, gazeTravel: 0.2 })
    expect(vars['--owl-blink-period']).toBe('11s')
    expect(vars['--owl-gaze-travel']).toBe('0.2')
  })
})
