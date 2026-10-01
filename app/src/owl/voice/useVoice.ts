import { useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { tuneValue } from '@/tune/store'
import { isNight } from '../resolve'
import { useOwlDesign, useTuneVersion } from '../useOwlDesign'
import { arrivalOccasion, chooseVoice, readVoiceConfig } from './config'
import { VoiceHold } from './hold'
import { watchIdle } from './idle'
import { getVoice } from './index'
import { pickLine } from './select'
import { Speaker, sessionMemory, type Spoken } from './speaker'
import type { OccasionId, SpeechPlace, SpeechSite, TreatmentId, VoiceConfig } from './types'

/**
 * Wires a `Speaker` to a component: what the owl says at one place, in the voice the panel
 * (or the owl's variant) names. Everything it does is in effects and timers, and it adds
 * no node of its own — `OwlSpeech` draws what it returns.
 *
 * It returns `null` when there is no voice, which is the default. A caller that gets `null`
 * adds no wrapper and no element, so an owl with no voice is the owl as it was.
 */

export type SiteVoice = {
  spoken: Spoken | null
  /** The text a screen reader is told: only a line that is a reply to the reader, and empty otherwise. */
  announced: string
  place: SpeechPlace
  treatment: TreatmentId
  typeMs: number
  /** Whether a click on the owl does anything; the owl shows a pointer for it. */
  poke: boolean
  /** The reader's own doing: a click or tap on the owl. */
  prod(): void
  dismiss(): void
  /** For the lab: say an occasion now, without the delay. */
  say(occasion: OccasionId): void
}

const memory = sessionMemory()

/** Is the owl called into the Explorer's conversation? The `owl.voice.chat` knob; off unless the panel says so. */
export function useChatOwl(): boolean {
  useTuneVersion()
  return readVoiceConfig(tuneValue).chat === 'row'
}

export function useOwlVoice(
  site: SpeechSite,
  options: {
    /** The variant the owl wears, which can name a voice of its own. */
    variant?: string
    /** The occasion the page says is true now, or none. Each time it becomes true the owl may speak. */
    occasion?: OccasionId | null
    /** Settings that win over the panel's: the lab's own owl, which has controls of its own. */
    config?: Partial<VoiceConfig>
  } = {},
): SiteVoice | null {
  useTuneVersion() // re-read the panel's values when any of them moves
  const held = useContext(VoiceHold)
  const config: VoiceConfig = { ...readVoiceConfig(tuneValue), ...options.config }
  const design = useOwlDesign(options.variant)
  // Under a hold (the lab) the voice is the hold's, and nothing is scheduled: the line is there already.
  const voice = held ? (getVoice(held.voice) ?? null) : chooseVoice(config, design.voice)
  const voiceId = held ? null : (voice?.id ?? null)
  const occasion = options.occasion ?? null

  // Read once, when the owl arrives, as the owl's own lantern is: a visit that spans the
  // hour keeps the arrival it began with.
  const [hour] = useState(() => new Date().getHours())
  const arrival = arrivalOccasion({ site, night: isNight(hour, design.night), voice, config })

  const [spoken, setSpoken] = useState<Spoken | null>(null)
  const [speaker] = useState(() => new Speaker({ voice, config, site }, setSpoken, memory))
  useLayoutEffect(() => {
    speaker.update({ voice, config, site })
  })

  // The owl arrives; or the voice is changed in the panel, and it says hello in the new one.
  useEffect(() => {
    if (voiceId && arrival) speaker.schedule(arrival)
    return () => speaker.cancel()
  }, [speaker, voiceId, arrival])

  // The page says something true has happened. When it stops being true (the search came
  // back, the refused code was typed over) the line about it comes down with it, rather
  // than standing out its dwell as a statement about a state the page has left.
  useEffect(() => {
    if (voiceId && occasion) speaker.schedule(occasion)
    return () => {
      speaker.cancel()
      if (occasion) speaker.retire(occasion)
    }
  }, [speaker, voiceId, occasion])

  // A line comes down when the voice goes, and when the owl does.
  useEffect(() => () => speaker.dismiss(), [speaker, voiceId])

  const idling = voiceId !== null && config.enabled.has('idle') && site.occasions.includes('idle')
  const idleMs = config.idleSeconds * 1000
  useEffect(() => {
    if (!idling || idleMs <= 0) return
    return watchIdle(idleMs, () => speaker.idle())
  }, [speaker, idling, idleMs])

  const standing = spoken !== null
  useEffect(() => {
    if (!standing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') speaker.dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [speaker, standing])

  // Stable, so the component that binds the click does not rebind it on every render.
  const prod = useCallback(() => speaker.poke(), [speaker])
  const dismiss = useCallback(() => speaker.dismiss(), [speaker])
  const say = useCallback((id: OccasionId) => speaker.say(id), [speaker])

  if (!voice) return null
  if (held) {
    const asked = held.occasion === 'arrival' ? site.arrival : held.occasion
    const text = asked && site.occasions.includes(asked) ? pickLine(voice, asked, [], 0) : null
    return {
      spoken: asked && text ? { key: 1, text, occasion: asked, announce: false } : null,
      announced: '',
      place: site.place,
      treatment: held.treatment ?? voice.treatment,
      typeMs: 0,
      poke: false,
      prod,
      dismiss,
      say,
    }
  }
  return {
    spoken,
    announced: spoken?.announce ? spoken.text : '',
    place: site.place,
    treatment: config.treatment ?? voice.treatment,
    typeMs: config.typeMs,
    poke: config.poke && site.occasions.includes('poke'),
    prod,
    dismiss,
    say,
  }
}
