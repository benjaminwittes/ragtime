import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTuneOverrides } from '@/tune/store'
import { OwlSpot } from '../OwlSpot'
import { getVoice, loadVoice, voiceIds } from './index'
import { loadSpeechLayer } from './layer'

/**
 * The owl as sent has no voice, so no voice code is in the page that carries it. These pin
 * the seam: which voices exist is known from the file names, a site that has chosen a voice
 * has its box from the first render whether or not the speech code has arrived, and the
 * speech is added inside that box and moves nothing when it comes.
 *
 * This file must not import `./all`, which would hand every voice to the registry. The tests
 * run in order and the first ones rely on that.
 */

afterEach(() => applyTuneOverrides({}, false))

describe('before any voice code is fetched', () => {
  it('knows which voices exist, and loads none of them to say so', () => {
    expect(voiceIds().has('archivist')).toBe(true)
    expect(getVoice('archivist')).toBeUndefined()
  })

  it('draws a site that has chosen a voice with its box and no speech yet', () => {
    applyTuneOverrides({ 'owl.voice.id': 'archivist' }, false)
    const html = renderToStaticMarkup(<OwlSpot site="gate" />)
    expect(html).toContain('owl-spot')
    expect(html).not.toContain('owl-voice-sr')
  })

  it('draws the default owl with neither a box nor speech', () => {
    const html = renderToStaticMarkup(<OwlSpot site="gate" />)
    expect(html).not.toContain('owl-spot')
    expect(html).not.toContain('owl-voice-sr')
  })

  it('treats a voice that is not registered as no voice, with no box', () => {
    applyTuneOverrides({ 'owl.voice.id': 'nobody' }, false)
    expect(renderToStaticMarkup(<OwlSpot site="gate" />)).not.toContain('owl-spot')
  })
})

describe('once the voice and the speech code have arrived', () => {
  it('adds the speech inside the same box, and the owl is the same owl', async () => {
    applyTuneOverrides({ 'owl.voice.id': 'archivist' }, false)
    const before = renderToStaticMarkup(<OwlSpot site="gate" />)
    await Promise.all([loadSpeechLayer(), loadVoice('archivist')])
    const after = renderToStaticMarkup(<OwlSpot site="gate" />)
    expect(after).toContain('owl-voice-sr')
    expect(after.replace(/<div class="owl-voice-sr"[^>]*><\/div>/, '')).toBe(before)
  })
})
