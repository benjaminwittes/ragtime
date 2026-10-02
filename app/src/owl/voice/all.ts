import { provideVoices } from './index'
import type { OwlVoice } from './types'

/**
 * Every voice, loaded together, for what looks at all of them: the lab, the Tune panel's
 * "Voice" knob (for the labels) and the tests. Nothing the app's pages import reaches this
 * file.
 *
 * Importing it hands each voice to the registry, so `getVoice` returns it at once.
 *
 * Voices are listed in file-name order.
 */

const modules = import.meta.glob<OwlVoice>('./voices/*.ts', { eager: true, import: 'default' })

const ALL: readonly OwlVoice[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id))

provideVoices(ALL)

export function voiceList(): readonly OwlVoice[] {
  return ALL
}
