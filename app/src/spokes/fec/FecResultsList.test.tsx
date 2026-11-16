/** The FEC results list: one row per ID with its cycles, counted as IDs. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FecFilterResult } from '@lawfare/ragtime-client'
import { FecResultsList } from './FecResultsList'

const result: FecFilterResult = {
  kind: 'candidate',
  total: 1234,
  limit: 25,
  offset: 0,
  results: [
    {
      id: 'S0GA00559',
      name: 'WARNOCK, RAPHAEL',
      office: 'S',
      state: 'GA',
      district: '00',
      party: 'DEM',
      status: 'C',
      latest_cycle: 2022,
      cycles: [2022, 2020],
      pcc: 'C00736876',
    },
  ],
}

const render = (r: FecFilterResult) =>
  renderToStaticMarkup(
    <FecResultsList result={r} loading={false} error={undefined} hasRun onOpen={() => {}} onPage={() => {}} />,
  )

describe('FecResultsList', () => {
  it('counts candidate IDs, not candidates', () => {
    const html = render(result)
    expect(html).toContain('1,234 candidate IDs matched')
    expect(html).not.toMatch(/\d candidates/)
  })

  it('shows one row per ID with every cycle, ascending and in full', () => {
    const html = render(result)
    expect(html.match(/Open candidate ID S0GA00559/g)).toHaveLength(1)
    const a = html.indexOf('2020 cycle (2019–2020)')
    const b = html.indexOf('2022 cycle (2021–2022)')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
  })

  it('keeps codes visible beside labels, with the FEC names in the headers', () => {
    const html = render(result)
    expect(html).toContain('S (Senate)')
    expect(html).toContain('C (Statutory candidate)')
    expect(html).toContain('(CAND_PTY_AFFILIATION)')
  })

  it('counts committee IDs for committees', () => {
    const html = render({
      kind: 'committee',
      total: 1,
      limit: 25,
      offset: 0,
      results: [
        { id: 'C00123456', name: 'X PAC', type: 'O', designation: 'U', party: null, state: 'DC', connected_org: null, cand_id: null, latest_cycle: 2024, cycles: [2024] },
      ],
    })
    expect(html).toContain('1 committee ID matched')
    expect(html).toContain('O (Independent expenditure-only (super PAC))')
  })
})
