/**
 * Non-component helpers for the FEC spoke (kept out of the .tsx files so
 * react-refresh sees component-only modules — the eac-format.ts precedent).
 *
 * The rules every FEC surface keeps (contract v1 and ragtime-dev
 * docs/briefs/fec-query-design.md, "Standing rules"):
 * - Amounts arrive as strings and are shown EXACTLY: thousands separators and
 *   two decimals, by string handling only. Nothing here parses an amount to a
 *   number, so nothing can be rounded, and nothing computes a figure (no
 *   differences, totals or percentages).
 * - Every figure is shown with its FEC variable name: "Total receipts (TTL_RECEIPTS)".
 * - Every figure links to the FEC file it came from, with the line number.
 * - A cycle is always said as "2022 cycle (2021–2022)": the figures are
 *   two-year cycle totals.
 * - Counts are of candidate IDs, not people.
 * - Codes stay visible: a plain label may sit beside a code, never replace it.
 */
import type { FecSource } from '@lawfare/ragtime-client'

/**
 * The corpus slug. Not yet a `CorpusSlug`: the generated registry lists live
 * corpora only, and fec is `building`. Cast where a CorpusSlug is needed until
 * fec is live and `npm run registry:sync` has run.
 */
export const FEC_SLUG = 'fec'

export const EM_DASH = '—'

/* ── amounts ─────────────────────────────────────────────────────────────── */

const DECIMAL = /^(-)?(\d+)(?:\.(\d*))?$/

/**
 * An FEC amount, exactly as sent, with thousands separators and at least two
 * decimals: "206593947.75" → "206,593,947.75", "-1234.5" → "-1,234.50",
 * "0" → "0.00", null → "—".
 *
 * String handling only — the value is never parsed to a float, so a figure
 * can never be rounded. Decimals beyond two (none in a numeric(14,2) column)
 * are kept, not rounded. A value that is not a plain decimal is shown as sent.
 */
export function formatFecAmount(value: unknown): string {
  if (value === null || value === undefined) return EM_DASH
  const raw = String(value).trim()
  if (raw === '') return EM_DASH
  const m = raw.match(DECIMAL)
  if (!m) return raw
  const [, sign, intPart, frac = ''] = m
  const digits = intPart.replace(/^0+(?=\d)/, '')
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = frac.length >= 2 ? frac : frac.padEnd(2, '0')
  return `${sign ?? ''}${grouped}.${decimals}`
}

/** A non-amount numeric value (e.g. GEN_ELECTION_PRECENT) or text: as sent. */
export function formatFecExact(value: unknown): string {
  if (value === null || value === undefined) return EM_DASH
  const raw = String(value).trim()
  return raw === '' ? EM_DASH : raw
}

/** A date column (YYYY-MM-DD…) as its date part, as sent. */
export function formatFecDate(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return EM_DASH
  const raw = String(value).trim()
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : raw
}

/* ── cycles ──────────────────────────────────────────────────────────────── */

/** 2022 → "2022 cycle (2021–2022)". The FEC names a cycle by its even year. */
export function cycleLabel(cycle: number | string | null | undefined): string {
  if (cycle === null || cycle === undefined || cycle === '') return EM_DASH
  const y = Number(cycle)
  if (!Number.isInteger(y)) return `${cycle} cycle`
  return `${y} cycle (${y - 1}–${y})`
}

/** A list of cycles, ascending, each as "2022 cycle (2021–2022)". */
export function cyclesLabel(cycles: readonly number[] | null | undefined): string {
  if (!cycles || cycles.length === 0) return EM_DASH
  return [...cycles].sort((a, b) => a - b).map(cycleLabel).join(', ')
}

export const FEC_CYCLE_NOTE =
  'Figures are two-year cycle totals as the FEC publishes them: the 2022 cycle covers 2021–2022. They cannot be cut to a single calendar year.'

/** The cycles the filter offers: every even year the bulk files cover. */
export function fecCycleOptions(first = 1980, last = 2026): number[] {
  const out: number[] = []
  for (let y = last; y >= first; y -= 2) out.push(y)
  return out
}

/* ── counts ──────────────────────────────────────────────────────────────── */

/** "1 candidate ID", "4,153 candidate IDs" — IDs, never people. */
export function idCountLabel(n: number | string | null | undefined, kind: 'candidate' | 'committee'): string {
  if (n === null || n === undefined || n === '') return EM_DASH
  const v = Number(n)
  const noun = kind === 'candidate' ? 'candidate ID' : 'committee ID'
  return `${Number.isFinite(v) ? v.toLocaleString('en-US') : String(n)} ${noun}${v === 1 ? '' : 's'}`
}

/* ── sources ─────────────────────────────────────────────────────────────── */

/** "webl file, 2022 cycle (2021–2022), line 812". */
export function sourceLabel(source: FecSource | null | undefined): string {
  if (!source) return 'Source not given'
  const parts = [`${source.kind} file`]
  if (source.cycle != null) parts.push(cycleLabel(source.cycle))
  if (source.line != null) parts.push(`line ${source.line}`)
  return parts.join(', ')
}

/** "webl file · line 812": the short form, under a column already headed by its cycle. */
export function sourceShortLabel(source: FecSource | null | undefined): string {
  if (!source) return 'Source not given'
  return source.line != null ? `${source.kind} file · line ${source.line}` : `${source.kind} file`
}

/* ── codes ───────────────────────────────────────────────────────────────── */

export const OFFICE_LABELS: Record<string, string> = {
  H: 'House',
  S: 'Senate',
  P: 'President',
}

export const PARTY_LABELS: Record<string, string> = {
  DEM: 'Democratic Party',
  REP: 'Republican Party',
  LIB: 'Libertarian Party',
  GRE: 'Green Party',
  IND: 'Independent',
  NPA: 'No party affiliation',
  NNE: 'None',
  OTH: 'Other',
  UNK: 'Unknown',
  CON: 'Constitution Party',
  W: 'Write-in',
}

/** CAND_STATUS. */
export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  C: 'Statutory candidate',
  F: 'Statutory candidate for a future election',
  N: 'Not yet a statutory candidate',
  P: 'Statutory candidate in a prior cycle',
}

/** CAND_ICI. */
export const ICI_LABELS: Record<string, string> = {
  C: 'Challenger',
  I: 'Incumbent',
  O: 'Open seat',
}

/** CMTE_TP. */
export const COMMITTEE_TYPE_LABELS: Record<string, string> = {
  C: 'Communication cost',
  D: 'Delegate committee',
  E: 'Electioneering communication',
  H: 'House',
  I: 'Independent expenditor (person or group)',
  N: 'PAC – nonqualified',
  O: 'Independent expenditure-only (super PAC)',
  P: 'Presidential',
  Q: 'PAC – qualified',
  S: 'Senate',
  U: 'Single-candidate independent expenditure',
  V: 'PAC with non-contribution account – nonqualified',
  W: 'PAC with non-contribution account – qualified',
  X: 'Party – nonqualified',
  Y: 'Party – qualified',
  Z: 'National party nonfederal account',
}

/** CMTE_DSGN. */
export const DESIGNATION_LABELS: Record<string, string> = {
  A: 'Authorized by a candidate',
  B: 'Lobbyist/registrant PAC',
  D: 'Leadership PAC',
  J: 'Joint fundraiser',
  P: 'Principal campaign committee',
  U: 'Unauthorized',
}

/** CMTE_FILING_FREQ. */
export const FILING_FREQ_LABELS: Record<string, string> = {
  A: 'Administratively terminated',
  D: 'Debt',
  M: 'Monthly filer',
  Q: 'Quarterly filer',
  T: 'Terminated',
  W: 'Waived',
}

/** ORG_TP. */
export const ORG_TYPE_LABELS: Record<string, string> = {
  C: 'Corporation',
  L: 'Labor organization',
  M: 'Membership organization',
  T: 'Trade association',
  V: 'Cooperative',
  W: 'Corporation without capital stock',
}

/**
 * A code as filed with its plain label beside it: "S (Senate)". The code is
 * always shown; an unknown code is shown alone; no code is "—".
 */
export function codeLabel(
  code: string | number | null | undefined,
  labels: Record<string, string>,
): string {
  if (code === null || code === undefined || String(code).trim() === '') return EM_DASH
  const c = String(code).trim()
  const label = labels[c.toUpperCase()]
  return label ? `${c} (${label})` : c
}

/* ── the figures each table shows, with their FEC variable names ────────── */

export type FecFieldType = 'amount' | 'exact' | 'date' | 'code'

export type FecField = {
  /** The column as the Worker sends it (the FEC name, lower case). */
  key: string
  /** The FEC variable name, as the FEC writes it. */
  fec: string
  label: string
  type: FecFieldType
  labels?: Record<string, string>
}

/** "Total receipts (TTL_RECEIPTS)". */
export function fieldLabel(f: Pick<FecField, 'label' | 'fec'>): string {
  return `${f.label} (${f.fec})`
}

/** One value of a field, formatted for its type. */
export function formatFecField(f: FecField, value: unknown): string {
  switch (f.type) {
    case 'amount':
      return formatFecAmount(value)
    case 'date':
      return formatFecDate(value)
    case 'code':
      return f.labels ? codeLabel(value as string | null, f.labels) : formatFecExact(value)
    default:
      return formatFecExact(value)
  }
}

const u = (key: string, label: string, type: FecFieldType = 'amount', labels?: Record<string, string>): FecField => ({
  key,
  fec: key.toUpperCase(),
  label,
  type,
  labels,
})

/**
 * weball / webl ("all candidates" / "candidate summary") — one layout. FEC
 * names are the bulk-file header names (TTL_RECEIPTS …), including the FEC's
 * own spelling GEN_ELECTION_PRECENT.
 */
export const CANDIDATE_TOTALS_FIELDS: FecField[] = [
  u('ttl_receipts', 'Total receipts'),
  u('trans_from_auth', 'Transfers from authorized committees'),
  u('ttl_disb', 'Total disbursements'),
  u('trans_to_auth', 'Transfers to authorized committees'),
  u('coh_bop', 'Cash on hand, beginning of period'),
  u('coh_cop', 'Cash on hand, close of period'),
  u('cand_contrib', 'Contributions from the candidate'),
  u('cand_loans', 'Loans from the candidate'),
  u('other_loans', 'Other loans'),
  u('cand_loan_repay', 'Repayments of candidate loans'),
  u('other_loan_repay', 'Repayments of other loans'),
  u('debts_owed_by', 'Debts owed by the committee'),
  u('ttl_indiv_contrib', 'Total individual contributions'),
  u('other_pol_cmte_contrib', 'Contributions from other political committees'),
  u('pol_pty_contrib', 'Contributions from party committees'),
  u('indiv_refunds', 'Refunds to individuals'),
  u('cmte_refunds', 'Refunds to committees'),
  u('cvg_end_dt', 'Coverage end date', 'date'),
  u('cand_ici', 'Incumbent / challenger / open seat', 'code', ICI_LABELS),
  u('pty_cd', 'Party code', 'exact'),
  u('cand_pty_affiliation', 'Party affiliation', 'code', PARTY_LABELS),
  u('cand_office_st', 'Office state', 'exact'),
  u('cand_office_district', 'Office district', 'exact'),
  u('spec_election', 'Special election result', 'exact'),
  u('prim_election', 'Primary election result', 'exact'),
  u('run_election', 'Runoff election result', 'exact'),
  u('gen_election', 'General election result', 'exact'),
  u('gen_election_precent', 'General election percent', 'exact'),
]

/** Title_Case for the candidate_summary CSV's headers (Net_Contribution …). */
const csv = (key: string, label: string, type: FecFieldType = 'amount', labels?: Record<string, string>): FecField => ({
  key,
  fec: key
    .split('_')
    .map((w) => (w === 'cop' || w === 'bop' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('_'),
  label,
  type,
  labels,
})

/** candidate_summary_YYYY.csv: the FEC's own 50-field summary (from 2008). */
export const CANDIDATE_SUMMARY_FIELDS: FecField[] = [
  csv('total_receipt', 'Total receipts'),
  csv('total_disbursement', 'Total disbursements'),
  csv('cash_on_hand_bop', 'Cash on hand, beginning of period'),
  csv('cash_on_hand_cop', 'Cash on hand, close of period'),
  csv('debt_owed_by_committee', 'Debts owed by the committee'),
  csv('debt_owe_to_committee', 'Debts owed to the committee'),
  csv('individual_itemized_contribution', 'Individual itemized contributions'),
  csv('individual_unitemized_contribution', 'Individual unitemized contributions'),
  csv('individual_contribution', 'Individual contributions'),
  csv('other_committee_contribution', 'Contributions from other committees'),
  csv('party_committee_contribution', 'Contributions from party committees'),
  csv('cand_contribution', 'Contributions from the candidate'),
  csv('total_contribution', 'Total contributions'),
  csv('transfer_from_other_auth_committee', 'Transfers from other authorized committees'),
  csv('cand_loan', 'Loans from the candidate'),
  csv('other_loan', 'Other loans'),
  csv('total_loan', 'Total loans'),
  csv('offsets_to_operating_expenditure', 'Offsets to operating expenditures'),
  csv('offsets_to_fundraising', 'Offsets to fundraising'),
  csv('offsets_to_leagal_accounting', 'Offsets to legal and accounting (FEC spelling)'),
  csv('other_receipts', 'Other receipts'),
  csv('operating_expenditure', 'Operating expenditures'),
  csv('exempt_legal_accounting_disbursement', 'Exempt legal and accounting disbursements'),
  csv('fundraising_disbursement', 'Fundraising disbursements'),
  csv('transfer_to_other_auth_committee', 'Transfers to other authorized committees'),
  csv('cand_loan_repayment', 'Repayments of candidate loans'),
  csv('other_loan_repayment', 'Repayments of other loans'),
  csv('total_loan_repayment', 'Total loan repayments'),
  csv('individual_refund', 'Refunds to individuals'),
  csv('party_committee_refund', 'Refunds to party committees'),
  csv('other_committee_refund', 'Refunds to other committees'),
  csv('total_contribution_refund', 'Total contribution refunds'),
  csv('other_disbursements', 'Other disbursements'),
  csv('net_contribution', 'Net contributions, as the FEC reports it'),
  csv('net_operating_expenditure', 'Net operating expenditures, as the FEC reports it'),
  csv('coverage_start_date', 'Coverage start date', 'date'),
  csv('coverage_end_date', 'Coverage end date', 'date'),
  csv('cand_office', 'Office', 'code', OFFICE_LABELS),
  csv('cand_office_st', 'Office state', 'exact'),
  csv('cand_office_dist', 'Office district', 'exact'),
  csv('cand_party_affiliation', 'Party affiliation', 'code', PARTY_LABELS),
  csv('cand_incumbent_challenger_open_seat', 'Incumbent / challenger / open seat', 'exact'),
]

/** webk: the PAC and party summary. */
export const PAC_PARTY_TOTALS_FIELDS: FecField[] = [
  u('ttl_receipts', 'Total receipts'),
  u('trans_from_aff', 'Transfers from affiliated committees'),
  u('indv_contrib', 'Contributions from individuals'),
  u('other_pol_cmte_contrib', 'Contributions from other political committees'),
  u('cand_contrib', 'Contributions from candidates'),
  u('cand_loans', 'Loans from candidates'),
  u('ttl_loans_received', 'Total loans received'),
  u('ttl_disb', 'Total disbursements'),
  u('tranf_to_aff', 'Transfers to affiliated committees (FEC spelling)'),
  u('indv_refunds', 'Refunds to individuals'),
  u('other_pol_cmte_refunds', 'Refunds to other political committees'),
  u('cand_loan_repay', 'Repayments of candidate loans'),
  u('loan_repay', 'Loan repayments'),
  u('coh_bop', 'Cash on hand, beginning of period'),
  u('coh_cop', 'Cash on hand, close of period'),
  u('debts_owed_by', 'Debts owed by the committee'),
  u('nonfed_trans_received', 'Nonfederal transfers received'),
  u('contrib_to_other_cmte', 'Contributions to other committees'),
  u('ind_exp', 'Independent expenditures'),
  u('pty_coord_exp', 'Party coordinated expenditures'),
  u('nonfed_share_exp', 'Nonfederal share of expenditures'),
  u('cvg_end_dt', 'Coverage end date', 'date'),
  u('cmte_tp', 'Committee type', 'code', COMMITTEE_TYPE_LABELS),
  u('cmte_dsgn', 'Designation', 'code', DESIGNATION_LABELS),
  u('cmte_filing_freq', 'Filing frequency', 'code', FILING_FREQ_LABELS),
]

/**
 * The two candidate totals files, in the order the page shows them: webl first,
 * the query design's default ("candidate summary file"), then weball.
 */
export const CANDIDATE_TOTALS_FILES = [
  {
    kind: 'webl',
    title: 'Candidate summary file (webl) — the default',
    note: 'House and Senate candidates registered or on the ballot for that election (current campaigns).',
  },
  {
    kind: 'weball',
    title: 'All-candidates file (weball)',
    note: 'Anyone who raised or spent money in the cycle, whenever they are up for election.',
  },
] as const
