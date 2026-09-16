/**
 * The rules that decide what the reader keeps.
 *
 * Every one of these is a way to lose a conversation someone paid for, which is the whole
 * reason the list exists — so they are pinned rather than read: what a conversation is
 * called, which one is given up when the device runs out of room, and what happens when
 * the index and the blobs disagree.
 */

import { describe, expect, it } from 'vitest'

import {
  EMPTY_INDEX,
  INDEX_VERSION,
  TITLE_MAX,
  conversationKey,
  evict,
  readIndex,
  reconcile,
  remove,
  spendOf,
  summarize,
  titleOf,
  upsert,
  type Index,
  type Summary,
} from './conversations.ts'
import type { Saved } from './persist.ts'
import type { Turn } from './turn.ts'

function turn(over: Partial<Turn> = {}): Turn {
  return {
    index: 0,
    phase: 'orient',
    prompt: 'a question',
    promptKind: 'ask',
    narration: [],
    answer: '',
    question: null,
    brief: null,
    rounds: [],
    handoffs: [],
    costs: [],
    error: null,
    stop: null,
    calls: 0,
    startedAt: 1000,
    endedAt: 2000,
    running: false,
    lastEvent: null,
    buffer: '',
    ...over,
  } as Turn
}

function saved(over: Partial<Saved> = {}): Saved {
  return {
    v: 1,
    turns: [turn()],
    brief: null,
    proposed: null,
    pinned: [],
    messages: [],
    envelope: null,
    savedAt: 5000,
    ...over,
  }
}

function summary(over: Partial<Summary> = {}): Summary {
  return { cid: 'a', title: 't', turns: 1, cents: 0, startedAt: 1, workedAt: 1, savedAt: 1, bytes: 100, ...over }
}

describe('conversationKey', () => {
  it('is the old single-conversation key with an id after it, so a prefix scan misses the legacy blob', () => {
    expect(conversationKey('abc')).toBe('ragtime_explorer_conversation_v1:abc')
    expect('ragtime_explorer_conversation_v1'.startsWith('ragtime_explorer_conversation_v1:')).toBe(false)
  })
})

describe('titleOf', () => {
  it('prefers the brief’s goal — the sentence the conversation agreed it was about', () => {
    const t = titleOf({
      brief: { goal: 'Find OLC opinions on removal for cause', corpora: [], answer_shape: '', constraints: [] } as never,
      turns: [turn({ prompt: 'what about removal?' })],
    })
    expect(t).toBe('Find OLC opinions on removal for cause')
  })

  it('falls back to the first question before a brief exists', () => {
    expect(titleOf({ brief: null, turns: [turn({ prompt: '  what   about\nremoval? ' })] })).toBe('what about removal?')
  })

  it('says so rather than showing an empty row', () => {
    expect(titleOf({ brief: null, turns: [] })).toBe('Untitled conversation')
    expect(titleOf({ brief: null, turns: [turn({ prompt: '   ' })] })).toBe('Untitled conversation')
  })

  it('cuts at a word, not mid-syllable', () => {
    const long = 'removal '.repeat(40).trim()
    const t = titleOf({ brief: null, turns: [turn({ prompt: long })] })
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX + 1)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/remov…$/)
  })

  it('cuts hard when there is no word boundary to cut at', () => {
    const t = titleOf({ brief: null, turns: [turn({ prompt: 'x'.repeat(200) })] })
    expect(t).toBe('x'.repeat(TITLE_MAX) + '…')
  })
})

describe('summarize', () => {
  it('dates the conversation from its first turn, not from the last save', () => {
    const s = summarize('c1', saved({ savedAt: 9000 }), 1234, 4.4)
    expect(s).toMatchObject({ cid: 'c1', turns: 1, bytes: 1234, cents: 4.4, startedAt: 1000, savedAt: 9000 })
  })

  it('says it was worked on when its last turn ended, not when the blob was last written', () => {
    // Merely opening the page re-saves the conversation it lands on. Reading `savedAt`
    // to the reader made a list of conversations from last week all say "just now" as
    // soon as they were browsed — the list stops telling them the one thing it is for.
    const s = summarize('c1', saved({ turns: [turn({ startedAt: 10, endedAt: 4000 })], savedAt: 900_000 }), 10, 0)
    expect(s.workedAt).toBe(4000)
    expect(s.savedAt).toBe(900_000)
  })

  it('falls back to the turn\u2019s start while it is still running, and to the save with no turns', () => {
    expect(summarize('c', saved({ turns: [turn({ startedAt: 77, endedAt: null })] }), 10, 0).workedAt).toBe(77)
    expect(summarize('c', saved({ turns: [], savedAt: 555 }), 10, 0).workedAt).toBe(555)
  })

  it('falls back to the save when a turn\u2019s clock is not a date', () => {
    // These blobs were written by earlier versions of this page; a zero here renders as
    // 1970, which reads as a broken row rather than an old one.
    expect(summarize('c', saved({ turns: [turn({ startedAt: 0, endedAt: 0 })], savedAt: 5000 }), 10, 0).workedAt).toBe(5000)
    expect(summarize('c', saved({ turns: [turn({ endedAt: Number.NaN })], savedAt: 5000 }), 10, 0).workedAt).toBe(5000)
  })

  it('dates an empty conversation from its save, since it has no first turn', () => {
    expect(summarize('c1', saved({ turns: [], savedAt: 9000 }), 10, 0).startedAt).toBe(9000)
  })
})

describe('upsert', () => {
  it('replaces the entry for the same conversation rather than adding a second', () => {
    let i: Index = EMPTY_INDEX
    i = upsert(i, summary({ cid: 'a', savedAt: 1, turns: 1 }))
    i = upsert(i, summary({ cid: 'a', savedAt: 2, turns: 3 }))
    expect(i.items).toHaveLength(1)
    expect(i.items[0]).toMatchObject({ turns: 3, savedAt: 2 })
  })

  it('orders by when work happened, not by when the blob was written', () => {
    let i: Index = EMPTY_INDEX
    // `savedAt` is deliberately the reverse of `workedAt`: opening an old conversation
    // re-saves it, and that must not promote it over one actually worked on later.
    i = upsert(i, summary({ cid: 'a', workedAt: 1, savedAt: 30 }))
    i = upsert(i, summary({ cid: 'b', workedAt: 3, savedAt: 10 }))
    i = upsert(i, summary({ cid: 'c', workedAt: 2, savedAt: 20 }))
    expect(i.items.map((x) => x.cid)).toEqual(['b', 'c', 'a'])
  })
})

describe('remove', () => {
  it('forgets the conversation, and stops calling it current', () => {
    const i = remove({ v: INDEX_VERSION, current: 'a', items: [summary({ cid: 'a' }), summary({ cid: 'b' })] }, 'a')
    expect(i.current).toBeNull()
    expect(i.items.map((x) => x.cid)).toEqual(['b'])
  })

  it('leaves current alone when it is not the one removed', () => {
    const i = remove({ v: INDEX_VERSION, current: 'b', items: [summary({ cid: 'a' }), summary({ cid: 'b' })] }, 'a')
    expect(i.current).toBe('b')
  })
})

describe('evict', () => {
  const idx = (items: Summary[], current: string | null = null): Index => ({ v: INDEX_VERSION, current, items })

  it('gives up nothing when the history fits', () => {
    const i = idx([summary({ cid: 'a', bytes: 10 }), summary({ cid: 'b', bytes: 10 })])
    expect(evict(i, 1000, 10).drop).toEqual([])
  })

  it('gives up the least recently written first \u2014 storage recency, not reading order', () => {
    const i = idx([
      summary({ cid: 'new', bytes: 400, savedAt: 30 }),
      summary({ cid: 'mid', bytes: 400, savedAt: 20 }),
      summary({ cid: 'old', bytes: 400, savedAt: 10 }),
    ])
    const out = evict(i, 900, 10)
    expect(out.drop).toEqual(['old'])
    expect(out.index.items.map((x) => x.cid)).toEqual(['new', 'mid'])
  })

  it('never gives up the conversation the reader is looking at', () => {
    const i = idx(
      [
        summary({ cid: 'new', bytes: 400, savedAt: 30 }),
        summary({ cid: 'old', bytes: 400, savedAt: 10 }),
      ],
      'old',
    )
    const out = evict(i, 500, 10)
    expect(out.drop).toEqual(['new'])
    expect(out.index.items.map((x) => x.cid)).toEqual(['old'])
  })

  it('enforces the count even when the bytes are nothing', () => {
    const i = idx([1, 2, 3, 4].map((n) => summary({ cid: 'c' + n, bytes: 1, savedAt: n })))
    expect(evict(i, 1_000_000, 2).drop).toEqual(['c1', 'c2'])
  })

  it('does not trust the list to be sorted — it reads the dates', () => {
    // Newest first is the convention, so this index is "wrong". Trusting it cost the
    // newest conversation instead of the oldest, silently, with no way back.
    const scrambled = idx([
      summary({ cid: 'mid', bytes: 400, savedAt: 20 }),
      summary({ cid: 'old', bytes: 400, savedAt: 10 }),
      summary({ cid: 'new', bytes: 400, savedAt: 30 }),
    ])
    expect(evict(scrambled, 900, 10).drop).toEqual(['old'])
  })

  it('stops as soon as it is inside both limits rather than emptying the list', () => {
    const i = idx([1, 2, 3, 4, 5].map((n) => summary({ cid: 'c' + n, bytes: 100, savedAt: n })))
    const out = evict(i, 350, 10)
    expect(out.drop).toEqual(['c1', 'c2'])
    expect(out.index.items).toHaveLength(3)
  })
})

describe('reconcile', () => {
  it('drops a row whose blob is gone, because it would open an empty page', () => {
    const i = reconcile(
      { v: INDEX_VERSION, current: 'a', items: [summary({ cid: 'a' }), summary({ cid: 'gone' })] },
      (cid) => cid !== 'gone',
    )
    expect(i.items.map((x) => x.cid)).toEqual(['a'])
    expect(i.current).toBe('a')
  })

  it('clears current when that is the one that went', () => {
    const i = reconcile({ v: INDEX_VERSION, current: 'gone', items: [summary({ cid: 'a' })] }, (cid) => cid === 'a')
    expect(i.current).toBeNull()
  })

  it('returns the same object when nothing is missing, so a render is not churned', () => {
    const i: Index = { v: INDEX_VERSION, current: 'a', items: [summary({ cid: 'a' })] }
    expect(reconcile(i, () => true)).toBe(i)
  })
})

describe('readIndex', () => {
  it('starts empty on a first visit, on nonsense, and on an older version', () => {
    expect(readIndex(null)).toEqual(EMPTY_INDEX)
    expect(readIndex('{')).toEqual(EMPTY_INDEX)
    expect(readIndex(JSON.stringify({ v: 0, current: null, items: [summary()] }))).toEqual(EMPTY_INDEX)
  })

  it('drops an entry that is not one of ours rather than the whole index', () => {
    const raw = JSON.stringify({ v: INDEX_VERSION, current: 'a', items: [summary({ cid: 'a' }), { nope: true }] })
    expect(readIndex(raw).items.map((x) => x.cid)).toEqual(['a'])
  })

  it('re-sorts, so a hand-edited or half-written index still draws newest first', () => {
    const raw = JSON.stringify({
      v: INDEX_VERSION,
      current: null,
      items: [summary({ cid: 'old', workedAt: 1 }), summary({ cid: 'new', workedAt: 9 })],
    })
    expect(readIndex(raw).items.map((x) => x.cid)).toEqual(['new', 'old'])
  })

  it('reads an index written before conversations had a worked-on date', () => {
    const older: Record<string, unknown> = { ...summary({ cid: 'a', savedAt: 5 }) }
    delete older.workedAt
    const raw = JSON.stringify({ v: INDEX_VERSION, current: null, items: [older, summary({ cid: 'b', workedAt: 1, savedAt: 1 })] })
    expect(readIndex(raw).items.map((x) => x.cid)).toEqual(['a', 'b'])
  })
})

describe('spendOf', () => {
  it('reads the last cost event that carried one', () => {
    const cost = (spend: number) => ({ type: 'cost', conversation_spend: spend }) as never
    expect(spendOf([turn({ costs: [cost(1), cost(2)] }), turn({ costs: [cost(4.4)] })])).toBe(4.4)
  })

  it('is zero for a conversation that never spent', () => {
    expect(spendOf([turn()])).toBe(0)
    expect(spendOf([])).toBe(0)
  })

  it('looks back past a turn that spent nothing', () => {
    const cost = (spend: number) => ({ type: 'cost', conversation_spend: spend }) as never
    expect(spendOf([turn({ costs: [cost(3)] }), turn({ costs: [] })])).toBe(3)
  })
})
