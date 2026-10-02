import { useContext } from 'react'
import { tuneValue } from '@/tune/store'
import type { TuneValue } from '@/tune/types'
import { useOwlDesign, useTuneVersion } from '../useOwlDesign'
import { VoiceHold } from './hold'
import { voiceIds } from './index'

/**
 * Whether the owl speaks at all, and in which voice: the part of the voice that is in the
 * page that carries the owl, so that the owl as sent — no voice — never loads the rest.
 *
 * Two knobs are read here, and their defaults are what ships: `owl.voice.id` is `none` and
 * `owl.voice.chat` is `off`. Everything else a voice needs (the timings, the occasions, the
 * words, the way a note is set) is `useVoice.ts` and what it imports, which a design that
 * picks a voice fetches when it does (`SpeechSlot`).
 */

export const VOICE_KNOB = 'owl.voice.id'
export const CHAT_KNOB = 'owl.voice.chat'

type Read = (knob: string) => TuneValue | undefined

/** The voice the panel picked, or null for none (the default). */
export function pickedVoice(read: Read): string | null {
  const picked = read(VOICE_KNOB)
  return typeof picked === 'string' && picked !== 'none' && picked !== '' ? picked : null
}

/** Is the owl called into the Explorer's conversation? The `owl.voice.chat` knob; off unless the panel says so. */
export function useChatOwl(): boolean {
  useTuneVersion()
  return tuneValue(CHAT_KNOB) === 'row'
}

/**
 * The id of the voice an owl at this place speaks in, or null when it is silent: the one the
 * panel picked, and when it picked none, the one the owl's own design names (a variant can
 * set `voice`). Under a hold (the lab) it is the hold's. An id that is not registered — a
 * stale preset — is silence too. It says *which*, and not what the voice says, so it needs
 * none of the voice's code.
 */
export function useChosenVoice(variant?: string): string | null {
  const held = useContext(VoiceHold)
  const design = useOwlDesign(variant)
  const id = held ? held.voice : (pickedVoice(tuneValue) ?? design.voice)
  return id !== null && voiceIds().has(id) ? id : null
}
