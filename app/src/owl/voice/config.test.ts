import { describe, expect, it } from 'vitest'
import { getTunable } from '@/tune/registry'
import '../knobs'
import { SPEECH_SITES } from '../embeds'
import { baseDesign } from '../design'
import { arrivalOccasion, chooseVoice, heardKey, occasionKnob, readVoiceConfig, shouldSpeak } from './config'
import './all'
import { getVoice } from './index'
import { OCCASION_IDS, type OwlVoice, type SpeechSite, type VoiceConfig } from './types'

const declared = (knob: string) => getTunable(knob)?.value

function config(patch: Partial<VoiceConfig> = {}): VoiceConfig {
  return { ...readVoiceConfig(declared), voice: 'ragtime', ...patch }
}

const ragtime = getVoice('ragtime') as OwlVoice
const silent: OwlVoice = { ...ragtime, id: 'silent', lines: {} }

describe('the defaults', () => {
  it('pick no voice in the panel, speak in the design\u2019s, and keep the chat off', () => {
    const c = readVoiceConfig(declared)
    expect(c.voice).toBeNull()
    expect(c.chat).toBe('off')
    expect(c.treatment).toBeNull()
    expect(baseDesign().voice).toBe('ragtime')
    expect(chooseVoice(c, baseDesign().voice)?.id).toBe('ragtime')
    expect(chooseVoice(c, null)).toBeNull()
  })

  it('have a knob for every occasion but the click, which has its own', () => {
    for (const id of OCCASION_IDS.filter((o) => o !== 'poke')) expect(getTunable(occasionKnob(id)), id).toBeDefined()
    expect(getTunable(occasionKnob('poke'))).toBeUndefined()
    expect(getTunable('owl.voice.poke')).toBeDefined()
  })

  it('read each knob into the field it names', () => {
    const c = readVoiceConfig(declared)
    expect(c.delayMs).toBe(declared('owl.voice.delay'))
    expect(c.dwellMs).toBe(declared('owl.voice.dwell'))
    expect(c.typeMs).toBe(declared('owl.voice.typeMs'))
    expect(c.idleSeconds).toBe(declared('owl.voice.idleSeconds'))
    expect(c.enabled.size).toBeGreaterThan(0)
  })
})

describe('readVoiceConfig', () => {
  it('turns a picked voice into its id, and “none” into none', () => {
    expect(readVoiceConfig((k) => (k === 'owl.voice.id' ? 'nobody' : undefined)).voice).toBe('nobody')
    expect(readVoiceConfig((k) => (k === 'owl.voice.id' ? 'none' : undefined)).voice).toBeNull()
  })

  it('takes a treatment only if it is one', () => {
    expect(readVoiceConfig((k) => (k === 'owl.voice.treatment' ? 'stamp' : undefined)).treatment).toBe('stamp')
    expect(readVoiceConfig((k) => (k === 'owl.voice.treatment' ? 'voice' : undefined)).treatment).toBeNull()
    expect(readVoiceConfig((k) => (k === 'owl.voice.treatment' ? 'neon' : undefined)).treatment).toBeNull()
  })

  it('does not let a stale preset put a non-number in a duration', () => {
    expect(readVoiceConfig((k) => (k === 'owl.voice.delay' ? 'soon' : undefined)).delayMs).toBe(0)
  })
})

describe('chooseVoice', () => {
  it('prefers the panel’s voice, then the design’s, and is silent for an id that is not registered', () => {
    expect(chooseVoice(config({ voice: 'ragtime' }), null)?.id).toBe('ragtime')
    expect(chooseVoice(config({ voice: null }), 'ragtime')?.id).toBe('ragtime')
    expect(chooseVoice(config({ voice: 'nobody' }), 'ragtime')).toBeNull()
    expect(chooseVoice(config({ voice: null }), null)).toBeNull()
    expect(chooseVoice(config({ voice: 'gone' }), null)).toBeNull()
  })
})

describe('shouldSpeak', () => {
  const site = SPEECH_SITES.hub
  const ask = (patch: Partial<Parameters<typeof shouldSpeak>[0]> = {}) =>
    shouldSpeak({ voice: ragtime, occasion: 'searching', config: config(), site, heard: new Set(), ...patch })

  it('speaks when everything agrees', () => {
    expect(ask()).toBe(true)
  })

  it('does not speak without a voice', () => {
    expect(ask({ voice: null })).toBe(false)
  })

  it('does not speak an occasion the site cannot report', () => {
    expect(ask({ occasion: 'wrong-code' })).toBe(false)
    expect(shouldSpeak({ voice: ragtime, occasion: 'wrong-code', config: config(), site: SPEECH_SITES.gate, heard: new Set() })).toBe(true)
  })

  it('does not speak an occasion switched off', () => {
    const enabled = new Set(config().enabled)
    enabled.delete('searching')
    expect(ask({ config: config({ enabled }) })).toBe(false)
  })

  it('is silent for a voice with no line for the occasion', () => {
    expect(ask({ voice: silent })).toBe(false)
  })

  it('says each occasion once a session when asked to, per voice', () => {
    const once = config({ oncePerSession: true })
    expect(ask({ config: once, heard: new Set([heardKey(ragtime, 'searching')]) })).toBe(false)
    expect(ask({ config: once, heard: new Set([heardKey(silent, 'searching')]) })).toBe(true)
    expect(ask({ config: once, heard: new Set([heardKey(ragtime, 'search-empty')]) })).toBe(true)
  })

  it('never rations idle or clicked lines', () => {
    const once = config({ oncePerSession: true })
    expect(ask({ occasion: 'idle', config: once, heard: new Set([heardKey(ragtime, 'idle')]) })).toBe(true)
  })
})

describe('arrivalOccasion', () => {
  const keeps: Pick<SpeechSite, 'arrival' | 'keepsHours' | 'occasions'> = SPEECH_SITES.hub
  const door: Pick<SpeechSite, 'arrival' | 'keepsHours' | 'occasions'> = SPEECH_SITES.gate

  it('is the site’s own by day', () => {
    expect(arrivalOccasion({ site: keeps, night: false, voice: ragtime, config: config() })).toBe('arrive-hub')
  })

  it('is the night line after dark, where the owl keeps hours and the voice has one', () => {
    expect(arrivalOccasion({ site: keeps, night: true, voice: ragtime, config: config() })).toBe('night')
  })

  it('stays the site’s own where the owl does not keep hours, or the voice has nothing for the night', () => {
    expect(arrivalOccasion({ site: door, night: true, voice: ragtime, config: config() })).toBe('arrive-gate')
    expect(arrivalOccasion({ site: keeps, night: true, voice: silent, config: config() })).toBe('arrive-hub')
  })

  it('is none at a site with no arrival line', () => {
    expect(arrivalOccasion({ site: SPEECH_SITES.record, night: false, voice: ragtime, config: config() })).toBeNull()
  })
})

describe('the speech table', () => {
  it('has an entry for every site, whose arrival is one of its occasions', () => {
    for (const [id, site] of Object.entries(SPEECH_SITES)) {
      if (site.arrival) expect(site.occasions, id).toContain(site.arrival)
      for (const occasion of site.occasions) expect(OCCASION_IDS, id).toContain(occasion)
    }
  })

  it('lets only the sites that keep hours speak of the night', () => {
    for (const [id, site] of Object.entries(SPEECH_SITES)) {
      expect(site.occasions.includes('night'), id).toBe(site.keepsHours)
    }
  })

  it('claims a search only where a search can be reported', () => {
    const where = (o: (typeof OCCASION_IDS)[number]) => Object.entries(SPEECH_SITES).filter(([, s]) => s.occasions.includes(o)).map(([id]) => id)
    expect(where('search-empty')).toEqual(['hub'])
    expect(where('search-results')).toEqual(['hub'])
    expect(where('wrong-code')).toEqual(['gate'])
    expect(where('searching')).toEqual(['hub'])
  })

  it('keeps the owl silent where its header has no bare paper for a note', () => {
    expect(SPEECH_SITES.record.occasions).toEqual([])
  })
})
