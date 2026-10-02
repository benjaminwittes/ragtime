import { lazy, useLazy, type Lazy } from '../lazy'
import type { OwlVoice } from './types'

/**
 * The voices, by id.
 *
 * A voice is a file in `voices/` whose default export is an `OwlVoice`: an id (the file's
 * name), a label, a note on its register, the treatment it is set in and its lines by
 * occasion. The glob finds it; nothing else needs editing, and the "Voice" knob lists it by
 * itself. Adding or changing a voice is editing data, not components.
 *
 * With no voice, which is the owl as sent, none of this is in the page that carries it:
 * what is here is the part that is, and it knows which voices exist (the file names) and
 * nothing of what they say. A voice's words are a chunk of their own, fetched the first
 * time a design picks that voice, and `all.ts` is the part that lists them all, for the lab.
 */

/** `./voices/archivist.ts` is `archivist`. */
const fileId = (path: string) => /([^/]+)\.ts$/.exec(path)![1]!

const loaders = import.meta.glob<OwlVoice>('./voices/*.ts', { import: 'default' })

const SLOTS = new Map<string, Lazy<OwlVoice>>(Object.entries(loaders).map(([path, load]) => [fileId(path), lazy(load)]))

const IDS: ReadonlySet<string> = new Set(SLOTS.keys())

/** The ids of every registered voice. They are the file names, so nothing is loaded to know them. */
export function voiceIds(): ReadonlySet<string> {
  return IDS
}

/** A voice that has been loaded; `undefined` for one that has not, and for an id that is not registered. */
export function getVoice(id: string | null | undefined): OwlVoice | undefined {
  return id ? SLOTS.get(id)?.get() : undefined
}

/** Fetch a voice, or resolve to `undefined` for an id that is not registered (a stale preset can name one that went). */
export async function loadVoice(id: string): Promise<OwlVoice | undefined> {
  return SLOTS.get(id)?.load()
}

/** `getVoice` for a component: `undefined` until the voice has arrived, and nothing is asked for with no id. */
export function useVoiceWords(id: string | null): OwlVoice | undefined {
  return useLazy(id ? SLOTS.get(id) : null)
}

/** For the code that has every voice in hand (`all.ts`). */
export function provideVoices(voices: readonly OwlVoice[]): void {
  for (const voice of voices) SLOTS.get(voice.id)?.provide(voice)
}

/**
 * For the knob that picks one: no voice first, because that is the default. A voice that has
 * not been loaded is listed by its id; the panel imports `all.ts` first, so it shows labels.
 */
export function voiceOptions(): { label: string; value: string }[] {
  return [
    { label: 'none', value: 'none' },
    ...[...IDS].sort((a, b) => a.localeCompare(b)).map((id) => ({ label: getVoice(id)?.label ?? id, value: id })),
  ]
}
