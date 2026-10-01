import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Conversation } from './Conversation.tsx'
import { applyEvent, newTurn, type Turn } from '../model/turn.ts'
import { applyTuneOverrides } from '@/tune/store'
import type { ExplorerEvent } from '@lawfare/ragtime-client'

const ev = (e: unknown) => e as ExplorerEvent
function fold(phase: 'orient' | 'research', events: unknown[]): Turn {
  let t = newTurn(0, phase, 'Find things', 'ask', 1000)
  for (const e of events) t = applyEvent(t, ev(e), 2000)
  return t
}
const text = (delta: string) => ({ type: 'text', delta })
const done = { type: 'done', envelope: 'e', stop: 'end_turn', history: [], calls: 1 }
const turns: Record<string, Turn[]> = {
  none: [],
  workingEmpty: [fold('research', [{ type: 'phase', phase: 'research' }])],
  workingLabel: [fold('orient', [{ type: 'phase', phase: 'orient' }, text('narr '), { type: 'tool_call', step: 1, id: 'a', name: 'search_corpora', input: {} }])],
  streaming: [fold('research', [{ type: 'phase', phase: 'research' }, text('The **answer** so far')])],
  answered: [fold('research', [{ type: 'phase', phase: 'research' }, text('The answer.'), done])],
  errored: [fold('research', [{ type: 'phase', phase: 'research' }, { type: 'error', code: 'x', message: 'boom' }, { ...done, stop: 'error' }])],
  orientBrief: [fold('orient', [{ type: 'phase', phase: 'orient' }, text('A brief. '), { type: 'phase', phase: 'orient', outcome: 'brief', brief: { goal: 'g', corpora: ['olc'], answer_shape: 's' } }, done])],
  two: [
    fold('research', [{ type: 'phase', phase: 'research' }, text('First.'), done]),
    { ...fold('research', [{ type: 'phase', phase: 'research' }]), index: 1, startedAt: 3000 },
  ],
}
const props = { brief: null, proposed: null, registry: { corpora: [] } as never, now: 5000, busy: false, onAccept: () => {} }

afterEach(() => applyTuneOverrides({}, false))

const html = (k: string) => renderToStaticMarkup(<Conversation turns={turns[k]!} {...props} />)

describe('the owl in the conversation (owl.voice.chat)', () => {
  it('adds nothing while the switch is off, whatever the turns are', () => {
    for (const name of Object.keys(turns)) expect(html(name), name).not.toContain('owl-chat')
  })

  it('stands in the working row, and not once words are arriving', () => {
    applyTuneOverrides({ 'owl.voice.chat': 'row' }, false)
    expect(html('workingEmpty')).toContain('owl-chat-fig')
    expect(html('streaming')).not.toContain('owl-chat')
  })

  it('settles at the foot of an answer that landed, and of no turn that did not answer', () => {
    applyTuneOverrides({ 'owl.voice.chat': 'row' }, false)
    expect(html('answered')).toContain('owl-chat-end')
    expect(html('orientBrief')).not.toContain('owl-chat-end')
    expect(html('errored')).not.toContain('owl-chat-end')
  })

  it('stands at the foot of the last turn only', () => {
    applyTuneOverrides({ 'owl.voice.chat': 'row' }, false)
    expect(html('two')).toContain('owl-chat-fig')
    expect(html('two')).not.toContain('owl-chat-end')
  })
})
