/**
 * The FEC sheets, rendered from fixed replies: amounts exactly as sent, FEC
 * variable names beside the figures, every figure linked to its source file
 * with the line shown, webl before weball, cycles said in full, and the
 * shared-principal-committee view shown as a flag for review.
 *
 * The sheet's Radix parts need a Dialog around them, so the views are
 * rendered inside a mocked sheet module (plain elements), as EAC's test does.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FecCandidateDetail, FecCommitteeDetail, FecSource } from '@lawfare/ragtime-client'

vi.mock('@/components/ui/sheet', () => ({
  SheetHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { FecCandidateView, FecCommitteeView } = await import('./FecDetailSheet')
const { FecSourceLink, FecValue } = await import('./FecFigures')
const { CANDIDATE_TOTALS_FIELDS } = await import('./fec-format')

const WEBL = 'https://www.fec.gov/files/bulk-downloads/2022/webl22.zip'
const WEBALL = 'https://www.fec.gov/files/bulk-downloads/2022/weball22.zip'
const src = (kind: string, url: string, line: number, cycle = 2022): FecSource => ({
  kind,
  cycle,
  url,
  line,
  sha256: 'x',
})

const candidate: FecCandidateDetail = {
  id: 'S0GA00559',
  cycles: [
    {
      cycle: 2022,
      name: 'WARNOCK, RAPHAEL',
      party: 'DEM',
      election_year: 2022,
      office: 'S',
      state: 'GA',
      district: '00',
      ici: 'I',
      status: 'C',
      pcc: 'C00736876',
      address: { st1: 'PO BOX 1', st2: null, city: 'ATLANTA', st: 'GA', zip: '30301' },
      source: src('cn', 'https://www.fec.gov/files/bulk-downloads/2022/cn22.zip', 4410),
    },
  ],
  totals: [
    { cycle: 2022, source_kind: 'weball', ttl_receipts: '999.00', source: src('weball', WEBALL, 77) },
    { cycle: 2022, source_kind: 'webl', ttl_receipts: '206593947.75', coh_cop: '-1234.5', ttl_disb: null, source: src('webl', WEBL, 812) },
  ],
  summary: [],
  committees: [
    {
      cycle: 2022,
      cmte_id: 'C00736876',
      cmte_name: 'WARNOCK FOR GEORGIA',
      cmte_tp: 'S',
      cmte_dsgn: 'P',
      linkage_id: 123,
      source: src('ccl', 'https://www.fec.gov/files/bulk-downloads/2022/ccl22.zip', 9),
    },
  ],
  shared_principal_committee: [
    { cycle: 2022, cand_pcc: 'C00736876', cand_ids: ['S0GA00559', 'S0GA00999'], cand_names: ['WARNOCK, RAPHAEL', 'WARNOCK, R'], n: 2 },
  ],
}

const render = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('FecCandidateView', () => {
  const html = render(<FecCandidateView id="S0GA00559" detail={candidate} loading={false} error={null} onOpen={() => {}} />)

  it('shows amounts exactly, with separators and two decimals, and an em dash for null', () => {
    expect(html).toContain('206,593,947.75')
    expect(html).toContain('-1,234.50')
    expect(html).not.toContain('206593947.75<')
    expect(html).not.toContain('206,593,948')
    expect(html).toContain('—')
  })

  it('labels every figure with its FEC variable name', () => {
    expect(html).toContain('Total receipts')
    expect(html).toContain('(TTL_RECEIPTS)')
    expect(html).toContain('(COH_COP)')
  })

  it('links each figure to its source file and shows the line', () => {
    expect(html).toContain(`href="${WEBL}"`)
    expect(html).toContain('webl file · line 812')
    expect(html).toContain(`href="${WEBALL}"`)
    expect(html).toContain('weball file · line 77')
  })

  it('shows webl first, labelled as the default, then weball', () => {
    const webl = html.indexOf('Candidate summary file (webl)')
    const weball = html.indexOf('All-candidates file (weball)')
    expect(webl).toBeGreaterThan(-1)
    expect(weball).toBeGreaterThan(webl)
    expect(html).toContain('the default')
    // Each file's table holds only its own rows.
    const weblSection = html.slice(webl, weball)
    expect(weblSection).toContain('206,593,947.75')
    expect(weblSection).not.toContain('999.00')
  })

  it('says each cycle in full, and that figures are two-year cycle totals', () => {
    expect(html).toContain('2022 cycle (2021–2022)')
    expect(html).toContain('two-year cycle totals')
  })

  it('keeps FEC codes visible beside their labels', () => {
    expect(html).toContain('S (Senate)')
    expect(html).toContain('DEM (Democratic Party)')
    expect(html).toContain('I (Incumbent)')
    expect(html).toContain('P (Principal campaign committee)')
  })

  it('shows the shared principal committee as a flag for review, not a merge', () => {
    expect(html).toContain('Flag for review')
    expect(html).toContain('not a finding that the IDs are the same candidate')
    expect(html).toContain('S0GA00999')
    expect(html).toContain('2 candidate IDs')
  })

  it('says candidate IDs, and computes nothing', () => {
    expect(html).toContain('candidate ID')
    expect(html).not.toMatch(/difference|percent of|net of/i)
  })

  it('shows the error, and no figures, when the record fails to load', () => {
    const e = render(<FecCandidateView id="S0GA00559" detail={null} loading={false} error="404 not found" />)
    expect(e).toContain('Could not load this record: 404 not found')
    expect(e).not.toContain('TTL_RECEIPTS')
  })
})

const committee: FecCommitteeDetail = {
  id: 'C00123456',
  cycles: [
    {
      cycle: 2024,
      name: 'EXAMPLE VICTORY FUND',
      treasurer: 'DOE, JANE',
      address: { st1: '1 MAIN ST', st2: null, city: 'WASHINGTON', st: 'DC', zip: '20001' },
      designation: 'J',
      type: 'N',
      party: null,
      filing_freq: 'Q',
      org_type: null,
      connected_org: null,
      cand_id: null,
      source: src('cm', 'https://www.fec.gov/files/bulk-downloads/2024/cm24.zip', 15, 2024),
    },
  ],
  totals: [
    { cycle: 2024, ttl_receipts: '1000000', ind_exp: '0.5', source: src('webk', 'https://www.fec.gov/files/bulk-downloads/2024/webk24.zip', 3001, 2024) },
  ],
  candidates: [
    {
      cycle: 2024,
      cand_id: 'H4XX00001',
      cand_name: 'SMITH, ALEX',
      office: 'H',
      state: 'XX',
      linkage_id: 55,
      source: src('ccl', 'https://www.fec.gov/files/bulk-downloads/2024/ccl24.zip', 2, 2024),
    },
  ],
  joint_fundraiser: true,
}

describe('FecCommitteeView', () => {
  const html = render(<FecCommitteeView id="C00123456" detail={committee} loading={false} error={null} onOpen={() => {}} />)

  it('shows webk totals exactly, with FEC names and source links', () => {
    expect(html).toContain('1,000,000.00')
    expect(html).toContain('0.50')
    expect(html).toContain('(IND_EXP)')
    expect(html).toContain('webk file · line 3001')
    expect(html).toContain('2024 cycle (2023–2024)')
  })

  it('notes a joint fundraiser', () => {
    expect(html).toContain('Joint fundraiser (CMTE_DSGN J)')
    expect(html).toContain('J (Joint fundraiser)')
  })

  it('lists linked candidate IDs as links that open the candidate sheet', () => {
    expect(html).toContain('H4XX00001')
    expect(html).toContain('title="Open candidate ID H4XX00001"')
  })
})

describe('FecSourceLink and FecValue', () => {
  const s = src('webl', WEBL, 812)

  it('links to source.url and shows the line', () => {
    const html = render(<FecSourceLink source={s} />)
    expect(html).toContain(`href="${WEBL}"`)
    expect(html).toContain('webl file, 2022 cycle (2021–2022), line 812')
    expect(html).toContain('target="_blank"')
  })

  it('shows the source as text when there is no URL', () => {
    const html = render(<FecSourceLink source={{ ...s, url: null }} short />)
    expect(html).not.toContain('href=')
    expect(html).toContain('webl file · line 812')
  })

  it('links a figure to its file, with its FEC name and line in the title', () => {
    const f = CANDIDATE_TOTALS_FIELDS.find((x) => x.key === 'ttl_receipts')!
    const html = render(<FecValue field={f} value="206593947.75" source={s} />)
    expect(html).toContain(`href="${WEBL}"`)
    expect(html).toContain('206,593,947.75')
    expect(html).toContain('Total receipts (TTL_RECEIPTS) — webl file, 2022 cycle (2021–2022), line 812')
  })
})
