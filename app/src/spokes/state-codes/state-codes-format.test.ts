import { describe, expect, it } from 'vitest'
import type { SemanticSearchRow } from '@lawfare/ragtime-client'
import {
  breakdownWords,
  citationFor,
  isInForce,
  notInForceBreakdown,
  parseSectionKey,
  rowCitation,
  semanticRowToSection,
  semanticRowsToSections,
  statusExplanation,
  statusLabel,
} from './state-codes-format'

describe('isInForce', () => {
  it('is true only for exactly in_force', () => {
    expect(isInForce({ status: 'in_force' })).toBe(true)
    for (const s of ['repealed', 'recodified', 'not_yet_applicable', 'In_Force', 'in_force ', '']) {
      expect(isInForce({ status: s })).toBe(false)
    }
  })

  it('flags a missing or null status rather than trusting it', () => {
    expect(isInForce({})).toBe(false)
    expect(isInForce({ status: null })).toBe(false)
    expect(isInForce(null)).toBe(false)
    expect(isInForce(undefined)).toBe(false)
  })
})

describe('statusLabel and statusExplanation', () => {
  it('labels every status, and an unknown one by its own words', () => {
    expect(statusLabel('not_funded')).toBe('Not funded')
    expect(statusLabel('not_yet_applicable')).toBe('Not yet applicable')
    expect(statusLabel(null)).toBe('Status unknown')
    expect(statusLabel('some_new_status')).toBe('some new status')
  })

  it('explains nothing for a section in force', () => {
    expect(statusExplanation({ status: 'in_force' })).toBeNull()
  })

  it('gives the start date of a section not yet applicable', () => {
    expect(statusExplanation({ status: 'not_yet_applicable', applicable_on: '2027-01-01' })).toContain(
      'applies from 2027-01-01',
    )
  })

  it('never calls an unreadable status in force', () => {
    expect(statusExplanation({ status: 'mystery' })).toContain('not shown as in force')
  })
})

describe('citations', () => {
  it('builds the D.C. Code form from a section number', () => {
    expect(citationFor('dc', '22-1307')).toBe('D.C. Code § 22-1307')
  })
  it('prefers the row citation, then the section number', () => {
    expect(rowCitation({ member: 'dc', citation: 'D.C. Code § 1-1', section_identifier: '1-2' })).toBe(
      'D.C. Code § 1-1',
    )
    expect(rowCitation({ member: 'dc', citation: null, section_identifier: '1-2' })).toBe('D.C. Code § 1-2')
  })
})

describe('parseSectionKey', () => {
  it('reads plain and member-qualified ids', () => {
    expect(parseSectionKey('123', 'dc')).toEqual({ member: 'dc', id: 123 })
    expect(parseSectionKey('dc:123', 'dc')).toEqual({ member: 'dc', id: 123 })
  })
  it('refuses anything else', () => {
    expect(parseSectionKey('22-1307', 'dc')).toBeNull()
    expect(parseSectionKey('dc:', 'dc')).toBeNull()
  })
})

describe('notInForceBreakdown', () => {
  it('counts every status but in_force, largest first', () => {
    const b = notInForceBreakdown({ in_force: 100, expired: 4, repealed: 31, not_funded: 1, sunset: 0 })
    expect(b.total).toBe(36)
    expect(b.parts.map((p) => p.status)).toEqual(['repealed', 'expired', 'not_funded'])
    expect(breakdownWords(b.parts)).toBe('31 repealed, 4 expired and 1 not funded')
  })
  it('is empty when everything matched is in force, or nothing was counted', () => {
    expect(notInForceBreakdown({ in_force: 5 }).total).toBe(0)
    expect(notInForceBreakdown(undefined).total).toBe(0)
  })
})

describe('semanticRowToSection', () => {
  const base: SemanticSearchRow = {
    id: '4410',
    title: 'D.C. Code § 22-1315',
    context: 'Repealed.',
    date: '2026-11-03',
    matched: 'semantic',
    score: 0.8,
    similarity: 0.8,
    snippet: null,
  }

  it('carries the status fields the Worker passes through', () => {
    const r = semanticRowToSection(
      { ...base, status: 'recodified', recodified_to: '22-1321', has_temporary_text: true, section_identifier: '22-1315' },
      'dc',
    )
    expect(r).toMatchObject({
      member: 'dc',
      id: 4410,
      citation: 'D.C. Code § 22-1315',
      heading: 'Repealed.',
      status: 'recodified',
      recodified_to: '22-1321',
      has_temporary_text: true,
      codified_date: '2026-11-03',
    })
  })

  it('leaves a missing status empty, so the row is flagged, not shown as in force', () => {
    const r = semanticRowToSection(base, 'dc')
    expect(r && isInForce(r)).toBe(false)
  })

  it('drops results whose id is not a section id', () => {
    expect(semanticRowsToSections([{ ...base, id: 'x' }, base], 'dc')).toHaveLength(1)
  })
})
