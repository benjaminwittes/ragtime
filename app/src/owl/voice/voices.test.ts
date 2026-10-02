import { describe, expect, it } from 'vitest'
import { voiceList } from './all'
import { getVoice, voiceIds, voiceOptions } from './index'
import { treatmentList, TREATMENTS } from './treatments'
import { OCCASION_IDS, TREATMENT_IDS } from './types'

/**
 * The voices are data, and these hold the data to the rules the copy has to keep. They
 * check structure and a few things that are never right in any register; whether the copy
 * is good is the owner's call, and is not something a test can say.
 */

describe('the voices', () => {
  const voices = voiceList()

  it('are at least three, with distinct ids', () => {
    expect(voices.length).toBeGreaterThanOrEqual(3)
    expect(new Set(voices.map((v) => v.id)).size).toBe(voices.length)
  })

  it('each have a label, a note on the register and a known treatment', () => {
    for (const voice of voices) {
      expect(voice.label, voice.id).not.toBe('')
      expect(voice.note, voice.id).not.toBe('')
      expect(TREATMENT_IDS, voice.id).toContain(voice.treatment)
    }
  })

  it('use all three treatments between them', () => {
    expect(new Set(voices.map((v) => v.treatment)).size).toBe(TREATMENT_IDS.length)
  })

  it('only have lines for occasions that exist', () => {
    for (const voice of voices) {
      for (const key of Object.keys(voice.lines)) expect(OCCASION_IDS as readonly string[], `${voice.id}/${key}`).toContain(key)
    }
  })

  it('have at least two lines for every occasion, so no occasion repeats itself or goes silent', () => {
    for (const voice of voices) {
      for (const occasion of OCCASION_IDS) {
        expect((voice.lines[occasion] ?? []).length, `${voice.id}/${occasion}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('never repeat a line within an occasion', () => {
    for (const voice of voices) {
      for (const [occasion, lines] of Object.entries(voice.lines)) {
        expect(new Set(lines).size, `${voice.id}/${occasion}`).toBe(lines?.length)
      }
    }
  })

  it('share no line with another voice on the same occasion, so no two voices are a paraphrase of each other', () => {
    for (const occasion of OCCASION_IDS) {
      const all = voices.flatMap((v) => (v.lines[occasion] ?? []).map((line) => line.toLowerCase()))
      expect(new Set(all).size, occasion).toBe(all.length)
    }
  })

  it('keep every line short', () => {
    for (const voice of voices) {
      for (const [occasion, lines] of Object.entries(voice.lines)) {
        for (const line of lines ?? []) expect(line.length, `${voice.id}/${occasion}: ${line}`).toBeLessThanOrEqual(40)
      }
    }
  })

  it('keep to the register: no exclamation, no emoji, no owl puns, no assistant-speak', () => {
    const banned = [/!/, /\p{Extended_Pictographic}/u, /\bhoot|\bwhoo|\bwho\b/i, /happy to|glad to|sure thing|let me know|as an ai/i]
    for (const voice of voices) {
      for (const [occasion, lines] of Object.entries(voice.lines)) {
        for (const line of lines ?? []) {
          for (const pattern of banned) expect(line, `${voice.id}/${occasion}`).not.toMatch(pattern)
        }
      }
    }
  })
})

describe('the registry', () => {
  it('finds a voice by id, and not one that is not there', () => {
    expect(getVoice('archivist')?.id).toBe('archivist')
    expect(getVoice('nobody')).toBeUndefined()
    expect(getVoice(null)).toBeUndefined()
  })

  it('names every voice by its file, which is how the registry knows it without loading it', () => {
    expect([...voiceIds()].sort()).toEqual(voiceList().map((v) => v.id).sort())
  })

  it('offers none first, and then every voice, to the knob', () => {
    expect(voiceOptions().map((o) => o.value)).toEqual(['none', ...voiceList().map((v) => v.id)])
  })
})

describe('the treatments', () => {
  it('are the three the type lists, each with a note', () => {
    expect(treatmentList().map((t) => t.id)).toEqual([...TREATMENT_IDS])
    for (const treatment of Object.values(TREATMENTS)) expect(treatment.note).not.toBe('')
  })
})
