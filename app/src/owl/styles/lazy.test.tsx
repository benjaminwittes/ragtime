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
    expect(styleMetas().map((m) => m.id)).toEqual(['blank', 'lines'])
    expect(styleOptions()).toContainEqual({ label: 'Line tiles', value: 'lines' })
    expect(styleOptions().map((o) => o.value)).not.toContain('blank')
    expect(getStyle('lines').id).toBe(FALLBACK_STYLE)
  })

  it('draws the default owl as an empty box on the first render, and fetches nothing for it', () => {
    const html = renderToStaticMarkup(<Owl />)
    expect(html).toContain('data-owl=')
    expect(html).not.toContain('<path')
    expect(getStyle('blank').id).toBe('blank')
    expect(getStyle('lines').id).toBe(FALLBACK_STYLE)
  })

  it('falls back to blank for a style that is not registered', () => {
    expect(getStyle('no-such-style').id).toBe(FALLBACK_STYLE)
  })
})

describe('once a style has arrived', () => {
  it('resolves to the style, and the owl draws it', async () => {
    const style = await loadStyle('lines')
    expect(style.id).toBe('lines')
    expect(getStyle('lines')).toBe(style)
    const html = renderToStaticMarkup(<Owl />)
    expect(html).toContain('<path')
    expect(html).toContain('data-lantern=')
  })

  it('resolves to blank for an id that is not registered, rather than failing', async () => {
    expect((await loadStyle('no-such-style')).id).toBe(FALLBACK_STYLE)
  })
})
