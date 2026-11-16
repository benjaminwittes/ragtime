import { describe, expect, it } from 'vitest'
import {
  CANDIDATE_SUMMARY_FIELDS,
  CANDIDATE_TOTALS_FIELDS,
  CANDIDATE_TOTALS_FILES,
  COMMITTEE_TYPE_LABELS,
  OFFICE_LABELS,
  PAC_PARTY_TOTALS_FIELDS,
  codeLabel,
  cycleLabel,
  cyclesLabel,
  fieldLabel,
  formatFecAmount,
  formatFecDate,
  formatFecField,
  idCountLabel,
  sourceLabel,
  sourceShortLabel,
} from './fec-format'

describe('formatFecAmount — exact strings, never parsed or rounded', () => {
  it('adds thousands separators and keeps the cents as sent', () => {
    expect(formatFecAmount('206593947.75')).toBe('206,593,947.75')
  })
  it('pads to two decimals', () => {
    expect(formatFecAmount('-1234.5')).toBe('-1,234.50')
    expect(formatFecAmount('1000')).toBe('1,000.00')
    expect(formatFecAmount('0')).toBe('0.00')
    expect(formatFecAmount('12.')).toBe('12.00')
  })
  it('shows null, undefined and empty as an em dash', () => {
    expect(formatFecAmount(null)).toBe('—')
    expect(formatFecAmount(undefined)).toBe('—')
    expect(formatFecAmount('')).toBe('—')
  })
  it('does not lose precision a float would lose', () => {
    // 2^53 + 1 cannot be held by a JS number; as a string it survives.
    expect(formatFecAmount('9007199254740993.01')).toBe('9,007,199,254,740,993.01')
    expect(formatFecAmount('0.10')).toBe('0.10')
  })
  it('keeps extra decimals rather than rounding them', () => {
    expect(formatFecAmount('1.005')).toBe('1.005')
  })
  it('shows a value that is not a plain decimal as sent', () => {
    expect(formatFecAmount('N/A')).toBe('N/A')
  })
  it('handles small negatives and leading zeros', () => {
    expect(formatFecAmount('-0.07')).toBe('-0.07')
    expect(formatFecAmount('000123.40')).toBe('123.40')
  })
})

describe('cycles', () => {
  it('says the two years a cycle covers', () => {
    expect(cycleLabel(2022)).toBe('2022 cycle (2021–2022)')
    expect(cycleLabel('2000')).toBe('2000 cycle (1999–2000)')
    expect(cycleLabel(null)).toBe('—')
  })
  it('lists cycles ascending', () => {
    expect(cyclesLabel([2024, 2020])).toBe('2020 cycle (2019–2020), 2024 cycle (2023–2024)')
    expect(cyclesLabel([])).toBe('—')
  })
})

describe('counts are candidate IDs, not candidates', () => {
  it('names the IDs', () => {
    expect(idCountLabel(1, 'candidate')).toBe('1 candidate ID')
    expect(idCountLabel(4153, 'candidate')).toBe('4,153 candidate IDs')
    expect(idCountLabel(0, 'committee')).toBe('0 committee IDs')
  })
})

describe('sources', () => {
  const source = {
    kind: 'webl',
    cycle: 2022,
    url: 'https://www.fec.gov/files/bulk-downloads/2022/webl22.zip',
    line: 812,
    sha256: 'abc',
  }
  it('names the file, the cycle and the line', () => {
    expect(sourceLabel(source)).toBe('webl file, 2022 cycle (2021–2022), line 812')
    expect(sourceShortLabel(source)).toBe('webl file · line 812')
  })
  it('says when no source was given', () => {
    expect(sourceLabel(null)).toBe('Source not given')
  })
})

describe('codes stay visible', () => {
  it('puts the plain label beside the code', () => {
    expect(codeLabel('S', OFFICE_LABELS)).toBe('S (Senate)')
    expect(codeLabel('O', COMMITTEE_TYPE_LABELS)).toBe('O (Independent expenditure-only (super PAC))')
  })
  it('shows an unknown code alone, and none as an em dash', () => {
    expect(codeLabel('ZZ', OFFICE_LABELS)).toBe('ZZ')
    expect(codeLabel(null, OFFICE_LABELS)).toBe('—')
  })
})

describe('field catalogues', () => {
  it('labels every figure with its FEC variable name', () => {
    const receipts = CANDIDATE_TOTALS_FIELDS.find((f) => f.key === 'ttl_receipts')!
    expect(fieldLabel(receipts)).toBe('Total receipts (TTL_RECEIPTS)')
    const net = CANDIDATE_SUMMARY_FIELDS.find((f) => f.key === 'net_contribution')!
    expect(net.fec).toBe('Net_Contribution')
    const coh = CANDIDATE_SUMMARY_FIELDS.find((f) => f.key === 'cash_on_hand_cop')!
    expect(coh.fec).toBe('Cash_On_Hand_COP')
    const ie = PAC_PARTY_TOTALS_FIELDS.find((f) => f.key === 'ind_exp')!
    expect(fieldLabel(ie)).toBe('Independent expenditures (IND_EXP)')
  })
  it('keeps the FEC’s own spellings', () => {
    expect(CANDIDATE_TOTALS_FIELDS.some((f) => f.fec === 'GEN_ELECTION_PRECENT')).toBe(true)
    expect(CANDIDATE_SUMMARY_FIELDS.some((f) => f.fec === 'Offsets_To_Leagal_Accounting')).toBe(true)
  })
  it('shows webl before weball', () => {
    expect(CANDIDATE_TOTALS_FILES.map((f) => f.kind)).toEqual(['webl', 'weball'])
  })
  it('formats each field for its type', () => {
    const receipts = CANDIDATE_TOTALS_FIELDS.find((f) => f.key === 'ttl_receipts')!
    expect(formatFecField(receipts, '206593947.75')).toBe('206,593,947.75')
    const pct = CANDIDATE_TOTALS_FIELDS.find((f) => f.key === 'gen_election_precent')!
    expect(formatFecField(pct, '51.4000')).toBe('51.4000')
    expect(formatFecDate('2022-12-31T00:00:00Z')).toBe('2022-12-31')
  })
})
