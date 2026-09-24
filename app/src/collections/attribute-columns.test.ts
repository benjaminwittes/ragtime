import { describe, expect, it } from 'vitest'
import type { CollectionCaseRow } from '@lawfare/ragtime-client'

import { attributeColumns } from './attribute-columns'

function row(attributes: Record<string, unknown>): CollectionCaseRow {
  return {
    cl_id: 1, docket_number: null, case_name: null, date_filed: null, date_terminated: null,
    judge: null, cause: null, nature_of_suit: null, plaintiff: null, defendant: null,
    entry_count: null, cl_url: null, court: null,
    attributes, member_source: null, added_at: null,
  }
}

describe('attributeColumns', () => {
  it('orders curated columns by how many cases fill them, then by name', () => {
    const rows = [
      row({ 'Plaintiff Type': 'individual', Harm: 'privacy', Defendant: 'X' }),
      row({ 'Plaintiff Type': 'company', Harm: 'defamation' }),
      row({ 'Plaintiff Type': 'state' }),
    ]
    expect(attributeColumns(rows)).toEqual(['Plaintiff Type', 'Harm', 'Defendant'])
  })

  it('skips internal keys and empty values', () => {
    const rows = [row({ _sheet_member_case_names: ['a'], Note: '', Court: 'N.D. Cal.' })]
    expect(attributeColumns(rows)).toEqual(['Court'])
  })
})
