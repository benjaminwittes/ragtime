import { describe, expect, it } from 'vitest'
import { landed } from './landed'

const ended = { running: false, error: null, stop: 'end_turn', question: null, brief: null, answer: 'The answer.' }

describe('landed', () => {
  it('is true of a finished turn with an answer', () => {
    expect(landed(ended)).toBe(true)
  })

  it('is false while the turn runs, or when it failed', () => {
    expect(landed({ ...ended, running: true })).toBe(false)
    expect(landed({ ...ended, error: { type: 'error' } })).toBe(false)
    expect(landed({ ...ended, stop: 'error' })).toBe(false)
  })

  it('is false for a turn that stopped on a cap, a question or a proposed brief', () => {
    expect(landed({ ...ended, stop: 'step_cap' })).toBe(false)
    expect(landed({ ...ended, stop: 'cap_cents' })).toBe(false)
    expect(landed({ ...ended, stop: 'question', question: 'Which court?' })).toBe(false)
    expect(landed({ ...ended, brief: { goal: 'x' } })).toBe(false)
  })

  it('is false with nothing to say it answered, or a stop that was never recorded', () => {
    expect(landed({ ...ended, answer: '' })).toBe(false)
    expect(landed({ ...ended, stop: null })).toBe(false)
  })
})
