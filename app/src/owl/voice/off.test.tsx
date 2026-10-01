import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTuneOverrides } from '@/tune/store'
import { OwlSpot } from '../OwlSpot'
import { SITES } from '../embeds'
import type { OwlSiteId } from '../types'

/**
 * The claim the experiment makes: with no voice picked, the owl is mounted exactly as it
 * was. Rendered on the server, where no effect runs, so what is compared is the markup a
 * site produces and not anything that happens after it.
 */

const ids = Object.keys(SITES) as OwlSiteId[]

afterEach(() => applyTuneOverrides({}, false))

describe('with no voice', () => {
  it.each(ids)('%s adds no wrapper, no live region and no note', (id) => {
    const html = renderToStaticMarkup(<OwlSpot site={id} occasion="searching" />)
    expect(html).not.toContain('owl-spot')
    expect(html).not.toContain('owl-voice-sr')
    expect(html).not.toContain('owl-note')
    expect(html).not.toContain('role="status"')
  })

  it('renders the same owl whatever occasion the page reports', () => {
    for (const id of ids) {
      expect(renderToStaticMarkup(<OwlSpot site={id} occasion="wrong-code" />)).toBe(renderToStaticMarkup(<OwlSpot site={id} />))
    }
  })
})

describe('with a voice', () => {
  it.each(ids)('%s gains the positioned box and an empty live region, and no note until something is said', (id) => {
    applyTuneOverrides({ 'owl.voice.id': 'archivist' }, false)
    const html = renderToStaticMarkup(<OwlSpot site={id} />)
    expect(html).toContain('owl-spot')
    expect(html).toContain('class="owl-voice-sr" role="status"></div>')
    expect(html).not.toContain('owl-note')
  })
})
