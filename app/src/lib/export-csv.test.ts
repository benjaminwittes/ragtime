import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCsv, csvCell, fileSlug } from './export-csv'

describe('csvCell', () => {
  it('leaves ordinary values unquoted', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('has spaces')).toBe('has spaces')
  })

  it('quotes on comma, quote, LF and CR', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('line1\rline2')).toBe('"line1\rline2"')
  })

  it('doubles every embedded quote, not just the first', () => {
    expect(csvCell('"a" and "b"')).toBe('"""a"" and ""b"""')
  })

  // The null/undefined -> '' rule is a nullish check, not falsiness. A cell
  // holding 0 or false is real data and has to survive the round trip; an
  // `if (!v)` here would silently blank both.
  it('blanks only null and undefined', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(false)).toBe('false')
    expect(csvCell('')).toBe('')
  })
})

describe('fileSlug', () => {
  it('lowercases and collapses runs of non-alphanumerics to one dash', () => {
    expect(fileSlug('US Code — Title 18')).toBe('us-code-title-18')
    expect(fileSlug('a___b   c')).toBe('a-b-c')
  })

  it('strips leading and trailing dashes', () => {
    expect(fileSlug('  ...hello...  ')).toBe('hello')
  })

  it('falls back to "export" when nothing survives', () => {
    expect(fileSlug('')).toBe('export')
    expect(fileSlug('!!!')).toBe('export')
    expect(fileSlug('   ')).toBe('export')
  })

  it('truncates to max', () => {
    expect(fileSlug('a'.repeat(60))).toHaveLength(48)
    expect(fileSlug('abcdef', 3)).toBe('abc')
  })

  // Characterisation, not endorsement: the trailing-dash strip runs BEFORE the
  // slice, so truncating can re-introduce the trailing dash it just removed.
  // Harmless in a filename, but pinned so a future fix is a deliberate change
  // to this expectation rather than a surprise.
  it('can leave a trailing dash when the cut lands on one', () => {
    expect(fileSlug('aa bb', 3)).toBe('aa-')
  })
})

describe('buildCsv', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const columns = [
    { header: 'id', value: (r: { id: number; name: string }) => r.id },
    { header: 'name', value: (r: { id: number; name: string }) => r.name },
  ]

  it('emits the comment header, then the column row, then the data', () => {
    const csv = buildCsv({ title: 'Test export', columns, rows: [{ id: 1, name: 'Alpha' }] })
    expect(csv.split('\n')).toEqual([
      '# Test export',
      '# generated: 2026-08-29T12:00:00.000Z',
      '#',
      'id,name',
      '1,Alpha',
    ])
  })

  it('defaults the title when none is given', () => {
    const csv = buildCsv({ columns, rows: [] })
    expect(csv.split('\n')[0]).toBe('# RAGtime — export')
  })

  // Metadata values are things like SQL and prompts, which contain newlines.
  // Each key has to stay on one comment line or the `#`-prefix contract breaks
  // and pandas' comment='#' starts reading prompt text as data.
  it('collapses multi-line metadata onto a single comment line', () => {
    const csv = buildCsv({
      meta: [{ key: 'sql', value: 'select *\n  from docs\n  where id = 1' }],
      columns,
      rows: [],
    })
    expect(csv).toContain('# sql: select * from docs where id = 1')
    expect(csv.split('\n').filter((l) => l.startsWith('# sql'))).toHaveLength(1)
  })

  it('drops metadata that is null, undefined or blank', () => {
    const csv = buildCsv({
      meta: [
        { key: 'kept', value: 'yes' },
        { key: 'nullish', value: null },
        { key: 'undef', value: undefined },
        { key: 'blank', value: '   ' },
      ],
      columns,
      rows: [],
    })
    expect(csv).toContain('# kept: yes')
    expect(csv).not.toContain('nullish')
    expect(csv).not.toContain('undef')
    expect(csv).not.toContain('blank')
  })

  it('wraps narrative markdown in delimited comment lines', () => {
    const csv = buildCsv({
      narrativeMarkdown: 'First line\nSecond line',
      columns,
      rows: [],
    })
    const lines = csv.split('\n')
    expect(lines).toContain('# --- narrative ---')
    expect(lines).toContain('# First line')
    expect(lines).toContain('# Second line')
    expect(lines).toContain('# --- end-narrative ---')
    expect(lines.indexOf('# --- narrative ---')).toBeLessThan(
      lines.indexOf('# --- end-narrative ---'),
    )
  })

  it('omits the narrative block when it is absent or whitespace', () => {
    expect(buildCsv({ columns, rows: [] })).not.toContain('narrative')
    expect(buildCsv({ narrativeMarkdown: '  \n ', columns, rows: [] })).not.toContain('narrative')
  })

  it('quotes headers and cells through csvCell', () => {
    const csv = buildCsv({
      columns: [{ header: 'a,b', value: (r: { v: string }) => r.v }],
      rows: [{ v: 'x"y' }],
    })
    const lines = csv.split('\n')
    expect(lines[lines.length - 2]).toBe('"a,b"')
    expect(lines[lines.length - 1]).toBe('"x""y"')
  })

  it('emits header rows and no data rows for an empty result set', () => {
    const csv = buildCsv({ columns, rows: [] })
    expect(csv.endsWith('id,name')).toBe(true)
  })
})
