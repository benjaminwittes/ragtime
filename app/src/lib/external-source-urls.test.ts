import { describe, it, expect } from 'vitest'
import { buildCfrSourceUrl, buildUscSourceUrl } from './external-source-urls'

// ============================================================================
// External source-URL helpers (PR 4x) — pin the constructed URL patterns
// so a stale uscode.house.gov / eCFR.gov format doesn't silently fall back
// to broken audit links.
// ============================================================================

describe('buildUscSourceUrl', () => {
  it('builds the canonical uscode.house.gov URL for a simple section', () => {
    expect(
      buildUscSourceUrl({ title_num: 18, section_identifier: '1112' }),
    ).toBe(
      'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1112&num=0&edition=prelim',
    )
  })

  it('strips a parenthesized subsection suffix (house.gov links to section, not subsection)', () => {
    expect(
      buildUscSourceUrl({ title_num: 8, section_identifier: '1225(b)(1)' }),
    ).toBe(
      'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title8-section1225&num=0&edition=prelim',
    )
  })

  it('preserves hyphenated and alphanumeric section numbers', () => {
    // E.g., 42 USC § 2000bb-1 (RFRA), 26 USC § 1010-1, etc.
    expect(
      buildUscSourceUrl({ title_num: 42, section_identifier: '2000bb-1' }),
    ).toBe(
      'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-section2000bb-1&num=0&edition=prelim',
    )
  })

  it('returns null when title_num is missing', () => {
    expect(buildUscSourceUrl({ title_num: null, section_identifier: '1112' })).toBe(null)
  })

  it('returns null when section_identifier is missing', () => {
    expect(buildUscSourceUrl({ title_num: 18, section_identifier: null })).toBe(null)
    expect(buildUscSourceUrl({ title_num: 18, section_identifier: '' })).toBe(null)
  })

  it('returns null when stripping subsections leaves an empty section', () => {
    // Pathological: section_identifier is just a subsection without the
    // section number. Shouldn't happen in practice; guard against it.
    expect(
      buildUscSourceUrl({ title_num: 18, section_identifier: '(a)(1)' }),
    ).toBe(null)
  })
})

describe('buildCfrSourceUrl', () => {
  it('builds the canonical eCFR.gov URL for a simple section', () => {
    expect(
      buildCfrSourceUrl({ title_num: 45, section_identifier: '164.502' }),
    ).toBe('https://www.ecfr.gov/current/title-45/section-164.502')
  })

  it('preserves the part prefix inside section_identifier', () => {
    // The CFR section_identifier carries the part as a prefix (164.502 =
    // part 164, section 164.502); eCFR uses it verbatim in the URL.
    expect(
      buildCfrSourceUrl({ title_num: 12, section_identifier: '1026.36' }),
    ).toBe('https://www.ecfr.gov/current/title-12/section-1026.36')
  })

  it('handles complex section identifiers with subsection parens', () => {
    // CFR section_identifier sometimes already includes a subsection like
    // 164.502(a). eCFR's short form is permissive and resolves the
    // subsection page; keep the literal value.
    expect(
      buildCfrSourceUrl({ title_num: 40, section_identifier: '1500.3(b)' }),
    ).toBe('https://www.ecfr.gov/current/title-40/section-1500.3(b)')
  })

  it('returns null when title_num is missing', () => {
    expect(buildCfrSourceUrl({ title_num: null, section_identifier: '164.502' })).toBe(null)
  })

  it('returns null when section_identifier is missing', () => {
    expect(buildCfrSourceUrl({ title_num: 45, section_identifier: null })).toBe(null)
    expect(buildCfrSourceUrl({ title_num: 45, section_identifier: '' })).toBe(null)
  })
})
