import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Owl } from '../Owl'
import { FALLBACK_STYLE, getStyle, loadStyle, styleMetas, styleOptions } from './index'

/**
 * The owl as sent is flat, and every other style is a chunk of its own. These pin the
 * three things that split has to keep: the default path never waits, a design that names a
 * style draws flat until it arrives and that style after, and the knob can list a style
 * whose drawing has not been loaded. Rendered on the server, where no effect runs, so what
 * is compared is the first markup an owl produces and nothing that happens after it.
 *
 * This file must not import `./all`, which would hand every drawing to the registry and
 * leave nothing to load. The tests run in order and the first ones rely on that.
 */

describe('before any style is fetched', () => {
  it('lists every style, with its label, without loading its drawing', () => {
    expect(styleMetas().map((m) => m.id)).toEqual(['blank', 'engraved', 'lines'])
    expect(styleOptions()).toContainEqual({ label: 'Engraved', value: 'engraved' })
    expect(getStyle('engraved').id).toBe(FALLBACK_STYLE)
  })

  it('draws the default owl as an empty box on the first render, and fetches nothing for it', () => {
    const html = renderToStaticMarkup(<Owl />)
    expect(html).toContain('data-owl=')
    expect(html).not.toContain('data-part=')
    expect(html).not.toContain('eng-')
    expect(getStyle('blank').id).toBe('blank')
    expect(getStyle('lines').id).toBe(FALLBACK_STYLE)
  })

  it('draws the empty box for a design that names a style that has not arrived', () => {
    const html = renderToStaticMarkup(<Owl variant="engraved-line" />)
    expect(html).toContain('data-owl=')
    expect(html).not.toContain('eng-frame')
  })

  it('falls back to blank for a style that is not registered', () => {
    expect(getStyle('no-such-style').id).toBe(FALLBACK_STYLE)
  })
})

describe('once a style has arrived', () => {
  it('resolves to the style, and the owl draws it', async () => {
    const style = await loadStyle('engraved')
    expect(style.id).toBe('engraved')
    expect(getStyle('engraved')).toBe(style)
    expect(renderToStaticMarkup(<Owl variant="engraved-line" />)).toContain('eng-frame')
  })

  it('leaves the default owl as it was', () => {
    expect(renderToStaticMarkup(<Owl />)).not.toContain('eng-')
  })

  it('resolves to blank for an id that is not registered, rather than failing', async () => {
    expect((await loadStyle('no-such-style')).id).toBe(FALLBACK_STYLE)
  })
})
