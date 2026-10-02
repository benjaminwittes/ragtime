import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { baseDesign } from './design'
import { OwlDrawing } from './scaffold'
import { styleList } from './styles/all'
import type { OwlLantern, OwlPose } from './types'

/**
 * The DOM contract (`contract.ts`), checked against every registered render style, so a
 * style added later is held to it without anyone remembering to write its test.
 */

const POSES: OwlPose[] = ['archivist', 'stacks']
const LANTERNS: OwlLantern[] = ['dark', 'lit', 'searching']

function render(styleId: string, pose: OwlPose, lantern: OwlLantern): string {
  const renderStyle = styleList().find((s) => s.id === styleId)
  if (!renderStyle) throw new Error(styleId)
  return renderToStaticMarkup(
    <OwlDrawing design={baseDesign()} poseId={pose} lantern={lantern} renderStyle={renderStyle} svgRef={{ current: null }} />,
  )
}

describe.each(styleList().map((s) => s.id))('render style %s', (styleId) => {
  for (const pose of POSES) {
    for (const lantern of LANTERNS) {
      it(`emits the contract for ${pose}, lantern ${lantern}`, () => {
        const html = render(styleId, pose, lantern)
        const eyes = baseDesign().poses[pose].eyes
        expect(html).toContain(`data-owl="${pose}"`)
        expect(html).toContain(`data-lantern="${lantern}"`)
        expect(html).toContain('class="owl"')
        expect(html).toContain('class="owl-eyes"')
        expect(html).toContain('class="owl-pupils"')
        expect(html).toContain('class="owl-glow"')
        // The gaze arithmetic reads the first circle of `.owl-eyes`: its `r`, and its `cy`.
        const first = /class="owl-eyes"><circle ([^>]*)>/.exec(html)?.[1] ?? ''
        expect(first).toContain(`r="${eyes.r}"`)
        expect(first).toContain(`cy="${eyes.cy}"`)
        // And how far to move comes with the owl, for a copy of it that is not React's.
        expect(html).toContain('--owl-gaze-travel:0.33')
      })
    }
  }

  it('draws the rims outside the blinking group', () => {
    const html = render(styleId, 'archivist', 'dark')
    const eyes = html.slice(html.indexOf('class="owl-eyes"'), html.indexOf('</g></g>') + 8)
    expect(eyes).not.toContain('fill="none"')
    expect(html).toContain('fill="none"')
  })
})
