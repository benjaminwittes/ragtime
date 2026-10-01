import type { OwlVoice } from './types'

/**
 * The voices, by id.
 *
 * A voice is a file in `voices/` whose default export is an `OwlVoice`: an id, a label, a
 * note on its register, the treatment it is set in and its lines by occasion. The glob
 * finds it; nothing else needs editing, and the "Voice" knob lists it by itself. Adding or
 * changing a voice is editing data, not components.
 *
 * Voices are listed in file-name order.
 */

const modules = import.meta.glob<OwlVoice>('./voices/*.ts', { eager: true, import: 'default' })

const ALL: readonly OwlVoice[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id))
const BY_ID = new Map(ALL.map((voice) => [voice.id, voice]))

export function voiceList(): readonly OwlVoice[] {
  return ALL
}

/** `undefined` for an id that is not registered — a stale preset can name one that went. */
export function getVoice(id: string | null | undefined): OwlVoice | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** For the knob that picks one: no voice first, because that is the default. */
export function voiceOptions(): { label: string; value: string }[] {
  return [{ label: 'none', value: 'none' }, ...ALL.map((voice) => ({ label: voice.label, value: voice.id }))]
}
