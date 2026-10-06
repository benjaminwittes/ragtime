import type { TuneValue } from '@/tune/types'
import '../knobs/deferred/voice'
import { CHAT_KNOB, VOICE_KNOB } from './choice'
import { getVoice } from './index'
import { OCCASION_IDS, type ChatMode, type OccasionId, type OwlVoice, type SpeechSite, type VoiceConfig } from './types'

/**
 * What the Tune panel's Voice group says, read into one value (`VoiceConfig`), and the
 * rules that turn a config and an occasion into "speak or stay quiet". Plain functions of
 * plain data, so they are tested in node (`config.test.ts`); `useVoice.ts` is the one place
 * that feeds them the live store.
 *
 * The defaults are not here. They are the `value:` of each knob in `knobs/voice.ts` and
 * `knobs/deferred/voice.ts` (imported above, which is how they arrive with this code), and
 * `read` finds them there.
 */

export { CHAT_KNOB, VOICE_KNOB }
export const DELAY_KNOB = 'owl.voice.delay'
export const DWELL_KNOB = 'owl.voice.dwell'
export const ONCE_KNOB = 'owl.voice.once'
export const POKE_KNOB = 'owl.voice.poke'
export const IDLE_KNOB = 'owl.voice.idleSeconds'

/** The knob that switches one occasion on. `poke` is the one occasion that has none of its own: `POKE_KNOB` is its switch. */
export const occasionKnob = (id: OccasionId) => `owl.voice.on.${id}`

type Read = (knob: string) => TuneValue | undefined

const num = (value: TuneValue | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const flag = (value: TuneValue | undefined): boolean => value === true

export function readVoiceConfig(read: Read): VoiceConfig {
  const picked = read(VOICE_KNOB)
  const chat = read(CHAT_KNOB)
  const enabled = new Set<OccasionId>()
  for (const id of OCCASION_IDS) {
    if (id === 'poke' ? flag(read(POKE_KNOB)) : flag(read(occasionKnob(id)))) enabled.add(id)
  }
  return {
    voice: typeof picked === 'string' && picked !== 'none' && picked !== '' ? picked : null,
    enabled,
    delayMs: num(read(DELAY_KNOB)),
    dwellMs: num(read(DWELL_KNOB)),
    oncePerSession: flag(read(ONCE_KNOB)),
    poke: flag(read(POKE_KNOB)),
    idleSeconds: num(read(IDLE_KNOB)),
    chat: (chat === 'row' ? 'row' : 'off') satisfies ChatMode,
  }
}

/**
 * The voice an owl speaks in: the one the panel picked, and when it picked none, the one
 * the owl's own design names (a variant can set `voice`). `null` is silence, and an id that
 * is not registered — a stale preset — is silence too.
 */
export function chooseVoice(config: VoiceConfig, designVoice: string | null): OwlVoice | null {
  return getVoice(config.voice ?? designVoice) ?? null
}

/** The key a "heard" record is kept under: once per session is once per voice and occasion. */
export const heardKey = (voice: OwlVoice, occasion: OccasionId) => `${voice.id}/${occasion}`

/**
 * Should the owl speak this occasion now? It does not if there is no voice, if the site
 * cannot truthfully report the occasion, if the panel has it switched off, if the voice has
 * no line for it, or — when the config says once a session — if it has already been said.
 * Idle and clicked lines are the reader's and the clock's, and are never rationed that way.
 */
export function shouldSpeak(args: {
  voice: OwlVoice | null
  occasion: OccasionId
  config: VoiceConfig
  site: Pick<SpeechSite, 'occasions'>
  heard: { has(key: string): boolean }
}): boolean {
  const { voice, occasion, config, site, heard } = args
  if (!voice) return false
  if (!site.occasions.includes(occasion)) return false
  if (!config.enabled.has(occasion)) return false
  if ((voice.lines[occasion] ?? []).length === 0) return false
  if (config.oncePerSession && occasion !== 'idle' && occasion !== 'poke' && heard.has(heardKey(voice, occasion))) return false
  return true
}

/**
 * The occasion the owl opens with. After dark, at a site that keeps hours, it is `night`
 * when the voice has something to say about it and `night` is on; otherwise the site's own
 * arrival. Never invented: a null here is silence on arrival.
 */
export function arrivalOccasion(args: {
  site: Pick<SpeechSite, 'arrival' | 'keepsHours' | 'occasions'>
  night: boolean
  voice: OwlVoice | null
  config: VoiceConfig
}): OccasionId | null {
  const { site, night, voice, config } = args
  if (night && site.keepsHours && site.occasions.includes('night') && config.enabled.has('night') && (voice?.lines.night ?? []).length > 0) {
    return 'night'
  }
  return site.arrival
}
