import { describe, expect, it } from 'vitest'
import { allTunables } from '@/tune/registry'
import '@/tune/knobs'

/**
 * The panel lists groups in the order their knobs registered. The deferred groups load after
 * the shipped ones, so `all.ts` puts the owl's knobs back in the order they had when every
 * group was one glob; this pins that order for the groups, and the voice's knobs within one.
 */
describe('the order the panel lists the owl’s knobs in', () => {
  const owl = allTunables().filter((knob) => knob.scope === 'owl')

  it('lists the groups in file-name order of the files that declare them', () => {
    const groups: string[] = []
    for (const knob of owl) if (!groups.includes(knob.group)) groups.push(knob.group)
    expect(groups.slice(0, 7)).toEqual(['Look', 'Palette', 'Lines', 'Shapes', 'Variant', 'Sites', 'Engraving · screen'])
    expect(groups.slice(7, 13)).toEqual([
      'Engraving · lines',
      'Engraving · tone',
      'Engraving · form',
      'Engraving · print',
      'Engraving · small sizes',
      'Scan finish',
    ])
    expect(groups.slice(13, 17)).toEqual(['Motion', 'Gaze', 'Lantern', 'Standing'])
    expect(groups.slice(-3)).toEqual(['Voice', 'Voice: occasions', 'Voice: chat'])
  })

  it('has the voice picker first and the chat switch last among the voice’s knobs', () => {
    const voice = owl.filter((knob) => knob.id.startsWith('owl.voice.')).map((knob) => knob.id)
    expect(voice[0]).toBe('owl.voice.id')
    expect(voice[voice.length - 1]).toBe('owl.voice.chat')
  })

  it('keeps the owl’s knobs after the other surfaces’ and moves none of theirs', () => {
    const scopes = allTunables().map((knob) => knob.scope)
    expect(scopes.lastIndexOf('owl')).toBe(scopes.length - 1)
    expect(scopes.indexOf('owl')).toBeGreaterThan(scopes.lastIndexOf('global'))
  })
})
