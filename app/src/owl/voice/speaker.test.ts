import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../knobs'
import { SPEECH_SITES } from '../embeds'
import { getTunable } from '@/tune/registry'
import { readVoiceConfig } from './config'
import './all'
import { getVoice } from './index'
import { Speaker, type Memory, type Spoken } from './speaker'
import type { OwlVoice, SpeechSite, VoiceConfig } from './types'

const declared = (knob: string) => getTunable(knob)?.value
const archivist = getVoice('archivist') as OwlVoice

function setup(patch: Partial<VoiceConfig> = {}, site: SpeechSite = SPEECH_SITES.hub) {
  const seen = new Set<string>()
  const memory: Memory = { heard: seen, recent: new Map(), roll: () => 0 }
  const events: (Spoken | null)[] = []
  const config: VoiceConfig = { ...readVoiceConfig(declared), voice: 'archivist', delayMs: 600, dwellMs: 6000, ...patch }
  const input = { voice: archivist, config, site }
  const speaker = new Speaker(input, (spoken) => events.push(spoken), memory)
  return { speaker, events, memory, seen, input }
}

const last = (events: (Spoken | null)[]) => events[events.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Speaker', () => {
  it('speaks after the delay, not before', () => {
    const { speaker, events } = setup()
    speaker.schedule('searching')
    vi.advanceTimersByTime(599)
    expect(events).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(last(events)?.occasion).toBe('searching')
    expect(last(events)?.text).toBe('Looking.')
  })

  it('takes the line down after the dwell', () => {
    const { speaker, events } = setup()
    speaker.schedule('searching')
    vi.advanceTimersByTime(600)
    vi.advanceTimersByTime(5999)
    expect(last(events)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(last(events)).toBeNull()
  })

  it('lets a newer occasion replace one still waiting', () => {
    const { speaker, events } = setup()
    speaker.schedule('searching')
    vi.advanceTimersByTime(300)
    speaker.schedule('search-empty')
    vi.advanceTimersByTime(10000)
    expect(events.filter(Boolean).map((e) => e?.occasion)).toEqual(['search-empty'])
  })

  it('cancels a waiting line without saying anything', () => {
    const { speaker, events } = setup()
    speaker.schedule('searching')
    speaker.cancel()
    vi.advanceTimersByTime(10000)
    expect(events).toHaveLength(0)
  })

  it('does not speak an occasion its site cannot report', () => {
    const { speaker, events } = setup({}, SPEECH_SITES.gate)
    speaker.schedule('search-empty')
    vi.advanceTimersByTime(10000)
    expect(events).toHaveLength(0)
  })

  it('asks the rules again when the line is due, so a switch turned off meanwhile is respected', () => {
    const { speaker, events, input } = setup()
    speaker.schedule('searching')
    vi.advanceTimersByTime(300)
    const enabled = new Set(input.config.enabled)
    enabled.delete('searching')
    speaker.update({ ...input, config: { ...input.config, enabled } })
    vi.advanceTimersByTime(300)
    expect(events).toHaveLength(0)
  })

  it('says an occasion once a session when the config says so', () => {
    const { speaker, events } = setup({ oncePerSession: true })
    speaker.schedule('searching')
    vi.advanceTimersByTime(600)
    speaker.dismiss()
    speaker.schedule('searching')
    vi.advanceTimersByTime(600)
    expect(events.filter(Boolean)).toHaveLength(1)
  })

  it('does not repeat a line twice running', () => {
    const { speaker, events } = setup({ dwellMs: 1500 })
    const said: string[] = []
    for (let i = 0; i < 12; i++) {
      speaker.schedule('searching')
      vi.advanceTimersByTime(600)
      said.push((last(events) as Spoken).text)
      vi.advanceTimersByTime(1500)
    }
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1])
  })

  it('numbers lines so a component can start a fresh reveal for each', () => {
    const { speaker, events } = setup()
    speaker.say('searching')
    speaker.say('search-empty')
    const keys = events.filter(Boolean).map((e) => e?.key)
    expect(keys).toEqual([1, 2])
  })

  it('marks only a reply to the reader for a screen reader', () => {
    const { speaker, events } = setup()
    speaker.say('search-empty')
    expect(last(events)?.announce).toBe(true)
    speaker.say('searching')
    expect(last(events)?.announce).toBe(false)
  })

  it('answers a click: says a line, then a click takes it down', () => {
    const { speaker, events } = setup()
    speaker.poke()
    expect(last(events)?.occasion).toBe('poke')
    speaker.poke()
    expect(last(events)).toBeNull()
  })

  it('does not answer a click when the config says not to', () => {
    const { speaker, events } = setup({ poke: false })
    speaker.poke()
    expect(events).toHaveLength(0)
  })

  it('says an idle line only when nothing is up, and only if idle is on', () => {
    const { speaker, events } = setup()
    speaker.idle()
    expect(last(events)?.occasion).toBe('idle')
    const count = events.length
    speaker.idle()
    expect(events).toHaveLength(count)

    const off = setup({ enabled: new Set() })
    off.speaker.idle()
    expect(off.events).toHaveLength(0)
  })

  it('takes a line down when the state it was about ends, and leaves any other line', () => {
    const { speaker, events } = setup()
    speaker.say('searching')
    speaker.retire('search-results')
    expect(last(events)?.occasion).toBe('searching')
    speaker.retire('searching')
    expect(last(events)).toBeNull()
    expect(events.filter(Boolean)).toHaveLength(1)
  })

  it('does not let an idle line cancel a line that is waiting for its delay', () => {
    const { speaker, events } = setup()
    speaker.schedule('search-empty')
    speaker.idle()
    vi.advanceTimersByTime(600)
    expect(events.filter(Boolean).map((e) => e?.occasion)).toEqual(['search-empty'])
  })

  it('is silent with no voice', () => {
    const { speaker, events, input } = setup()
    speaker.update({ ...input, voice: null })
    speaker.schedule('searching')
    speaker.say('searching')
    speaker.poke()
    vi.advanceTimersByTime(10000)
    expect(events).toHaveLength(0)
  })
})
