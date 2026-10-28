import { describe, expect, it } from 'vitest'

import { citationOf, DEFAULT_RECORDBENCH_URL, MAX_REFS, recordbenchOrigin, REPORT_MAX, saveMessage } from './recordbench-save'

// The save page's own reading of an address (recordbench `frontend/src/lib/save.ts`). A
// message this builds must pass it, or the page drops the row.
const BENCH_RT_REF = /^rt:\/\/([a-z]+)(?::[a-z_]+)?\/(?:[a-z_]+:)?\d{1,12}$/

describe('recordbenchOrigin', () => {
  it('is the hosted bench when nothing is configured', () => {
    expect(recordbenchOrigin(undefined)).toBe(new URL(DEFAULT_RECORDBENCH_URL).origin)
    expect(recordbenchOrigin('  ')).toBe(new URL(DEFAULT_RECORDBENCH_URL).origin)
  })

  it('is the configured origin, without its path', () => {
    expect(recordbenchOrigin('http://localhost:5178/#/bench')).toBe('http://localhost:5178')
  })
})

describe('saveMessage', () => {
  it('addresses each document as the save page reads it', () => {
    // Ids as the hub returns them, including the collection-qualified ones.
    for (const [corpus, id] of [
      ['olc', '1117'],
      ['commentary', 'lawfare:68295'],
      ['congress', 'bills:162510'],
      ['fr', 1006065],
    ] as const) {
      expect(citationOf({ corpus, id })).toMatch(BENCH_RT_REF)
    }
  })

  it('carries one document, its title and version 1', () => {
    expect(saveMessage('document', [{ corpus: 'olc', id: '1117', title: ' An opinion ' }])).toEqual({
      type: 'recordbench:save',
      v: 1,
      outcome: 'document',
      name: null,
      refs: [{ ref: 'rt://olc/1117', title: 'An opinion' }],
    })
  })

  it('names a list for the search and drops the same document twice', () => {
    const m = saveMessage(
      'list',
      [
        { corpus: 'usc', id: '32225', title: '22 U.S.C. § 8512' },
        { corpus: 'usc', id: '32225', title: '22 U.S.C. § 8512' },
        { corpus: 'cfr', id: '220059' },
      ],
      ' International Emergency Economic Powers Act ',
    )
    expect(m?.name).toBe('International Emergency Economic Powers Act')
    expect(m?.refs.map((r) => r.ref)).toEqual(['rt://usc/32225', 'rt://cfr/220059'])
    expect(m?.refs[1]?.title).toBeNull()
  })

  it('stops at the most the save page takes', () => {
    const items = Array.from({ length: MAX_REFS + 5 }, (_, i) => ({ corpus: 'fr', id: i + 1 }))
    expect(saveMessage('list', items)?.refs).toHaveLength(MAX_REFS)
  })

  it('has nothing to hand over for an empty list or a document that is two', () => {
    expect(saveMessage('list', [])).toBeNull()
    expect(
      saveMessage('document', [
        { corpus: 'olc', id: '1' },
        { corpus: 'olc', id: '2' },
      ]),
    ).toBeNull()
  })
})

describe('a research librarian report', () => {
  const cited = [{ corpus: 'olc', id: '1117', title: 'An opinion' }]

  it('carries its words beside the addresses it cites, and the question', () => {
    const message = saveMessage('report', cited, ' Who may invoke it? ', '  Two opinions say so.\n\nNeither settles it.  ')
    expect(message).toEqual({
      type: 'recordbench:save',
      v: 1,
      outcome: 'report',
      name: 'Who may invoke it?',
      refs: [{ ref: 'rt://olc/1117', title: 'An opinion' }],
      report: { text: 'Two opinions say so.\n\nNeither settles it.' },
    })
  })

  it('is nothing without words or without a cited document', () => {
    expect(saveMessage('report', cited, 'q', '   ')).toBeNull()
    expect(saveMessage('report', cited, 'q')).toBeNull()
    expect(saveMessage('report', [], 'q', 'Words.')).toBeNull()
  })

  it('stops at the most the save page keeps, and only a report carries words', () => {
    expect(saveMessage('report', cited, 'q', 'x'.repeat(REPORT_MAX + 10))?.report?.text).toHaveLength(REPORT_MAX)
    expect(saveMessage('list', cited, 'q', 'Words.')).not.toHaveProperty('report')
  })
})
