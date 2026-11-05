import { describe, expect, it } from 'vitest'

import { SAMPLES } from '@/hub/samples'

import { EXAMPLE_QUESTIONS } from './examples'
import { LANDING_BEATS, landingBeat } from './landing'

describe('landingBeat', () => {
  it('opens on the old fixed heading, so the hub morph lands on the sentence it left', () => {
    expect(landingBeat(0)).toEqual({ heading: 'Ask the federal record a question.', slug: 'all', question: null })
  })

  it('walks every corpus the hub does, in the hub order', () => {
    const slugs = Array.from({ length: LANDING_BEATS }, (_, n) => landingBeat(n).slug)
    expect(slugs).toEqual(SAMPLES.map((s) => s.slug))
  })

  it("offers each corpus's own questions, one per pass", () => {
    const n = SAMPLES.findIndex((s) => s.slug !== 'all')
    const set = SAMPLES[n]!
    expect(landingBeat(n).question).toBe(set.samples[0].question)
    expect(landingBeat(n + LANDING_BEATS).question).toBe(set.samples[1].question)
    expect(landingBeat(n + 3 * LANDING_BEATS).question).toBe(set.samples[0].question)
  })

  it('never repeats a question the examples already show', () => {
    const examples = new Set(EXAMPLE_QUESTIONS.map((q) => q.text))
    for (let n = 0; n < LANDING_BEATS * 3; n++) {
      const q = landingBeat(n).question
      if (q) expect(examples.has(q)).toBe(false)
    }
  })
})
