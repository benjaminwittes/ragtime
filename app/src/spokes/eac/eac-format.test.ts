import { describe, it, expect } from 'vitest'
import {
  eacDate,
  eacLink,
  eacTitle,
  fileTypeLabel,
  folderLabel,
  formatBytes,
  isFullDisplay,
  isLibraryReuploadDate,
} from './eac-format'

// Fixtures are shaped like the live /corpus/eac/filter and semantic-search rows.
const linkOnlyFilterRow = {
  id: 2209,
  title: 'HRT-01755_Lab_Analysis',
  author_group: 'Voting system test lab',
  display: 'link_only',
  source_url: 'https://www.eac.gov/sites/default/files/2026-10/HRT-01755_Lab_Analysis.pdf',
  bytes: 161434,
  is_data_file: false,
}

describe('isFullDisplay', () => {
  it('is true only for exactly "full"', () => {
    expect(isFullDisplay({ display: 'full' })).toBe(true)
    expect(isFullDisplay({ display: 'link_only' })).toBe(false)
  })
  it('treats a missing, null or unknown display as link-only', () => {
    expect(isFullDisplay({})).toBe(false)
    expect(isFullDisplay({ display: null })).toBe(false)
    expect(isFullDisplay({ display: 'FULL' })).toBe(false)
    expect(isFullDisplay({ display: 'full ' })).toBe(false)
    expect(isFullDisplay(null)).toBe(false)
    expect(isFullDisplay(undefined)).toBe(false)
  })
})

describe('eacDate', () => {
  it('reads posted_date or date and keeps YYYY-MM-DD', () => {
    expect(eacDate({ posted_date: '2025-02-06' })).toBe('2025-02-06')
    expect(eacDate({ date: '2026-09-03T00:00:00Z' })).toBe('2026-09-03')
  })
  it('is null when a link-only filter row arrives without a date', () => {
    expect(eacDate(linkOnlyFilterRow)).toBeNull()
  })
})

describe('eacTitle', () => {
  it('turns file-name titles into words', () => {
    expect(eacTitle('Attachment_D_VotingWorks_VxSuite_4.0_Test_Plan_As_Run')).toBe(
      'Attachment D VotingWorks VxSuite 4.0 Test Plan As Run',
    )
  })
  it('drops a trailing file extension, and only at the end', () => {
    expect(eacTitle('2008 Election Administration and Voting Survey EAVS Report.pdf')).toBe(
      '2008 Election Administration and Voting Survey EAVS Report',
    )
    expect(eacTitle('Standards Board Meeting Agenda DRAFT (002).PDF')).toBe(
      'Standards Board Meeting Agenda DRAFT (002)',
    )
    expect(eacTitle('FY_2022_Data.xlsx')).toBe('FY 2022 Data')
    expect(eacTitle('VotingWorks 4.0 Test Plan v3.0')).toBe('VotingWorks 4.0 Test Plan v3.0')
    expect(eacTitle('Guide to pdf accessibility')).toBe('Guide to pdf accessibility')
  })
  it('falls back when there is no title', () => {
    expect(eacTitle(null)).toBe('Untitled document')
    expect(eacTitle('  ')).toBe('Untitled document')
  })
})

describe('eacLink', () => {
  it('prefers source_url, then url', () => {
    expect(eacLink(linkOnlyFilterRow)).toBe(linkOnlyFilterRow.source_url)
    expect(eacLink({ url: 'https://www.eac.gov/x.pdf' })).toBe('https://www.eac.gov/x.pdf')
    expect(eacLink({})).toBeNull()
  })
})

describe('fileTypeLabel', () => {
  it('names common types and leaves unknown ones as stored', () => {
    expect(fileTypeLabel('pdf')).toBe('PDF')
    expect(fileTypeLabel('vnd.ms-excel')).toBe('Excel')
    expect(fileTypeLabel('vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('Word')
    expect(fileTypeLabel('x-something')).toBe('x-something')
    expect(fileTypeLabel(null)).toBeNull()
  })
})

describe('folderLabel', () => {
  it('reads dated and section folders', () => {
    expect(folderLabel('dated:2025')).toBe('Uploaded in 2025')
    expect(folderLabel('voting_system')).toBe('Voting system')
    expect(folderLabel('document_library')).toBe('Document library')
    expect(folderLabel(null)).toBeNull()
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(161434)).toBe('158 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(null)).toBeNull()
  })
})

describe('isLibraryReuploadDate', () => {
  it('flags only the 2023-04-27 library re-upload date', () => {
    expect(isLibraryReuploadDate('2023-04-27')).toBe(true)
    expect(isLibraryReuploadDate('2024-01-31')).toBe(false)
    expect(isLibraryReuploadDate(null)).toBe(false)
  })
})
