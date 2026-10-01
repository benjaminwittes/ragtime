import { describe, it, expect } from 'vitest'

import {
  caseDoc,
  dayOf,
  frDoc,
  heightOf,
  layOut,
  lengthSaid,
  olcDoc,
  ordinalTicks,
  uscDoc,
  yearTicks,
  type StageDoc,
} from './record'

function doc(over: Partial<StageDoc> = {}): StageDoc {
  return {
    id: 'a',
    title: 'A document',
    line: null,
    number: null,
    at: dayOf('2001-09-18'),
    when: '2001-09-18',
    chars: 30_000,
    count: 10,
    lane: null,
    face: 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: null,
    href: '/corpus/olc/1',
    ...over,
  }
}

describe('a row from a collection, as a thing on the floor', () => {
  it('an OLC opinion: its edge is how it reached the public, its film is how well it was read', () => {
    const base = { id: 7, title: 'T', author: 'A', date_issued: '1984-10-01', source_url_doj: null, source_url_knight: null, page_count: 44, text_length: 120_000 }
    const published = olcDoc({ ...base, source: 'doj-published', ocr_quality: 'clean' })
    const released = olcDoc({ ...base, source: 'knight-foia', ocr_quality: 'degraded' })
    expect([published.rough, published.film]).toEqual([false, 0])
    expect([released.rough, released.film]).toEqual([true, 1])
    expect(published.href).toBe('/corpus/olc/7')
    expect(published.count).toBe(44)
  })

  it('an opinion with no length on record is drawn open, not given one', () => {
    const got = olcDoc({ id: 1, title: null, author: null, date_issued: null, source: null, source_url_doj: null, source_url_knight: null, page_count: null, text_length: null, ocr_quality: null })
    expect(got.face).toBe('open')
    expect(got.at).toBeNull()
    expect(got.title).toBe('(untitled opinion)')
  })

  it('a Federal Register document: proposed is hatched, open for comment has no cap, a RIN is its family', () => {
    const row = {
      id: 3, doc_type: 'proposed_rule', subtype: null, document_number: '2026-1', title: 'A rule', agency_names: ['Treasury Department'],
      significant: true, regulation_id_numbers: ['1505-AC00'], publication_date: '2026-09-01', effective_on: null,
      comments_close_on: '2026-11-01', fr_citation: '91 FR 100', text_length: 9000, html_url: null, pdf_url: null,
    }
    const open = frDoc(row, '2026-10-01')
    expect([open.face, open.capped, open.marked, open.family, open.lane]).toEqual(['hatched', false, true, '1505-AC00', 'proposed rule'])
    expect(frDoc(row, '2026-12-01').capped).toBe(true)
    expect(frDoc({ ...row, doc_type: 'rule', comments_close_on: null }, '2026-10-01').face).toBe('solid')
  })

  it('a case: its length is its docket, it is capped when terminated, and its row is its level of court', () => {
    const row = {
      cl_id: 99, docket_number: '1:25-cv-1', case_name: 'A v. B', date_filed: '2025-02-01', date_terminated: null, judge: null,
      cause: null, nature_of_suit: null, plaintiff: null, defendant: null, entry_count: 212, cl_url: null, court: 'dcd',
    }
    const open = caseDoc(row)
    expect([open.chars, open.count, open.capped, open.lane]).toEqual([null, 212, false, 'district courts'])
    expect(caseDoc({ ...row, date_terminated: '2026-01-01', court: 'cadc' }).lane).toBe('courts of appeals')
    expect(caseDoc({ ...row, date_terminated: '2026-01-01' }).capped).toBe(true)
    expect(caseDoc({ ...row, entry_count: null }).face).toBe('open')
  })

  it('a section of the Code stands at its title, not at a date', () => {
    const got = uscDoc({ id: 5, title_num: 50, title_name: 'War and National Defense', citation: '50 U.S.C. § 21', heading: 'Restraint of alien enemies', section_identifier: null, is_positive_law: false, status: 'active', text_length: 2400 })
    expect([got.at, got.when, got.lane, got.face]).toEqual([50, 'Title 50', 'not positive law', 'solid'])
    expect(uscDoc({ id: 5, title_num: 50, title_name: null, citation: null, heading: null, section_identifier: null, is_positive_law: null, status: 'repealed', text_length: 10 }).face).toBe('hatched')
  })
})

describe('height', () => {
  it('rises with length, by orders of magnitude, on a scale that does not move', () => {
    const memo = heightOf(doc({ chars: 6_000 }))
    const opinion = heightOf(doc({ chars: 120_000 }))
    const rule = heightOf(doc({ chars: 2_000_000 }))
    expect(memo).toBeLessThan(opinion)
    expect(opinion).toBeLessThan(rule)
    expect(rule).toBeLessThanOrEqual(1)
    // The same document is the same height whatever else is on stage with it.
    expect(heightOf(doc({ chars: 120_000 }))).toBe(opinion)
  })

  it('falls back to the count where there is no text, and to a fixed low height where there is neither', () => {
    expect(heightOf(doc({ chars: null, count: 400 }))).toBeGreaterThan(heightOf(doc({ chars: null, count: 4 })))
    expect(heightOf(doc({ chars: null, count: null }))).toBe(0.16)
    expect(heightOf(doc({ chars: 1 }))).toBeGreaterThan(0)
  })
})

describe('where things stand', () => {
  it('puts each document at its date, earliest at stage left', () => {
    const laid = layOut([doc({ id: 'late', at: dayOf('2020-01-01') }), doc({ id: 'early', at: dayOf('1950-01-01') }), doc({ id: 'mid', at: dayOf('1985-01-01') })])
    const x = Object.fromEntries(laid.placed.map((each) => [each.doc.id, each.x]))
    expect(x.early).toBe(0)
    expect(x.late).toBe(1)
    expect(x.mid).toBeCloseTo(0.5, 1)
    expect(laid.unplaced).toBe(0)
  })

  it('never moves a document along the floor to make room: neighbours step toward the audience instead', () => {
    const same = dayOf('2001-09-18')
    const laid = layOut([doc({ id: 'a', at: same }), doc({ id: 'b', at: same }), doc({ id: 'c', at: same })].concat(doc({ id: 'z', at: dayOf('1990-01-01') })))
    const crowd = laid.placed.filter((each) => each.doc.id !== 'z')
    expect(new Set(crowd.map((each) => each.x)).size).toBe(1)
    expect(new Set(crowd.map((each) => each.z)).size).toBe(3)
  })

  it('stands what has no date in the wings, and says how many', () => {
    const laid = layOut([doc({ id: 'dated' }), doc({ id: 'undated', at: null, when: null })])
    expect(laid.unplaced).toBe(1)
    expect(laid.placed.find((each) => each.doc.id === 'undated')?.x).toBeNull()
  })

  it('gives each kind a row, back to front in the order they arrive, deeper where more stands', () => {
    const many = Array.from({ length: 30 }, (_, i) => doc({ id: `n${i}`, lane: 'notice', at: 10_000 + i * 40 }))
    const laid = layOut([...many, doc({ id: 'r', lane: 'rule' })])
    expect(laid.lanes.map((lane) => lane.name)).toEqual(['notice', 'rule'])
    expect(laid.lanes[0].to - laid.lanes[0].from).toBeGreaterThan(laid.lanes[1].to - laid.lanes[1].from)
    expect(laid.lanes[1].to).toBeCloseTo(1)
    const rule = laid.placed.find((each) => each.doc.id === 'r')
    expect(rule && rule.z).toBeGreaterThan(laid.lanes[0].to)
  })

  it('lands the back row first', () => {
    const laid = layOut([doc({ id: 'front', lane: 'rule' }), doc({ id: 'back', lane: 'notice' })].reverse())
    const order = Object.fromEntries(laid.placed.map((each) => [each.doc.id, each.order]))
    expect(order.back).toBeLessThan(order.front)
  })

  it('joins documents that are one proceeding, in date order, and no document to itself', () => {
    const laid = layOut([
      doc({ id: 'final', family: 'RIN-1', at: dayOf('2026-01-01') }),
      doc({ id: 'proposed', family: 'RIN-1', at: dayOf('2025-01-01') }),
      doc({ id: 'alone', family: 'RIN-2' }),
    ])
    expect(laid.families).toEqual([{ key: 'RIN-1', ids: ['proposed', 'final'] }])
  })

  it('makes a floor for one date, and none for nothing', () => {
    expect(layOut([doc()]).placed[0].x).toBeCloseTo(0.5)
    expect(layOut([]).span).toBeNull()
  })
})

describe('the marks along the floor', () => {
  it('are whole years, thinned to fit a long floor', () => {
    const ticks = yearTicks({ from: dayOf('1948-06-01') as number, to: dayOf('2022-06-01') as number })
    expect(ticks.map((tick) => tick.label)).toEqual(['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020'])
    expect(ticks.every((tick) => tick.x >= 0 && tick.x <= 1)).toBe(true)
  })

  it('are months on a floor a few months long', () => {
    const ticks = yearTicks({ from: dayOf('2026-03-10') as number, to: dayOf('2026-09-04') as number })
    expect(ticks.map((tick) => tick.label)).toEqual(['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'])
  })

  it('cross a new year', () => {
    const ticks = yearTicks({ from: dayOf('2025-11-20') as number, to: dayOf('2026-02-10') as number })
    expect(ticks.map((tick) => tick.label)).toEqual(['Dec 2025', 'Jan 2026', 'Feb 2026'])
  })

  it('are whole numbers on a floor that is the Code', () => {
    expect(ordinalTicks({ from: 1, to: 54 }).map((tick) => tick.label)).toEqual(['5', '10', '15', '20', '25', '30', '35', '40', '45', '50'])
  })
})

describe('length, in words', () => {
  it('uses the collection’s own count where it has one, and says "about" where it is worked out', () => {
    expect(lengthSaid(doc({ count: 44 }), 'pages')).toBe('44 pages')
    expect(lengthSaid(doc({ count: 1 }), 'pages')).toBe('1 page')
    expect(lengthSaid(doc({ count: 1 }), 'entries')).toBe('1 entry')
    expect(lengthSaid(doc({ count: 1204 }), 'entries')).toBe('1,204 entries')
    expect(lengthSaid(doc({ count: null, chars: 12_000 }), null)).toBe('about 4 pages of text')
    expect(lengthSaid(doc({ count: null, chars: null }), 'pages')).toBeNull()
  })
})
