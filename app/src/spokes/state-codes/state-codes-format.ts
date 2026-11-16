/**
 * Non-component helpers for the State Codes spoke (kept out of the .tsx files
 * so react-refresh sees component-only modules, as eac-format.ts does).
 *
 * The rule these helpers hold: only a section whose status is exactly
 * `in_force` is treated as live law. A missing, null or unknown status is
 * flagged like any other not-in-force status, so a Worker that drops or
 * misspells the field makes the page warn more, never less.
 */
import type {
  SemanticSearchRow,
  StateCodeSectionDisplayRow,
  StateCodeStatus,
  StateCodesMember,
} from '@lawfare/ragtime-client'

/**
 * The corpus slug. Not yet a `CorpusSlug`: the generated registry lists live
 * corpora only, and state_codes is not registered. See index.ts.
 */
export const STATE_CODES_SLUG = 'state_codes'

/** The members, in the order the page lists them. Only the District for now. */
export const STATE_CODES_MEMBERS: readonly StateCodesMember[] = ['dc']

/** What the page calls each member when the Worker's facets have not said. */
export const MEMBER_FALLBACK: Record<StateCodesMember, { label: string; codeName: string }> = {
  dc: { label: 'District of Columbia', codeName: 'D.C. Code' },
}

export function memberLabel(member: string | null | undefined): string {
  return (member && MEMBER_FALLBACK[member as StateCodesMember]?.label) || member || 'Unknown jurisdiction'
}

export function memberCodeName(member: string | null | undefined): string {
  return (member && MEMBER_FALLBACK[member as StateCodesMember]?.codeName) || 'Code'
}

/** The semantic-search slug for one member: member-scoped, like
 *  congress:laws, so a member's pane never returns another member's sections. */
export function semanticSlugFor(member: StateCodesMember): `state_codes:${StateCodesMember}` {
  return `state_codes:${member}`
}

export const STATUS_LABELS: Record<StateCodeStatus, string> = {
  in_force: 'In force',
  repealed: 'Repealed',
  expired: 'Expired',
  recodified: 'Recodified',
  reserved: 'Reserved',
  transferred: 'Transferred',
  omitted: 'Omitted',
  sunset: 'Sunset',
  not_funded: 'Not funded',
  not_applicable: 'Not applicable',
  not_yet_applicable: 'Not yet applicable',
  empty: 'Empty',
}

/** The statuses in the order the status filter lists them: in force first,
 *  then the not-in-force statuses, the commonest first. */
export const STATUS_ORDER: readonly StateCodeStatus[] = [
  'in_force',
  'repealed',
  'expired',
  'not_funded',
  'recodified',
  'reserved',
  'transferred',
  'omitted',
  'not_applicable',
  'not_yet_applicable',
  'sunset',
  'empty',
]

/** Live law: exactly 'in_force', nothing else. */
export function isInForce(row: { status?: string | null } | null | undefined): boolean {
  return row?.status === 'in_force'
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Status unknown'
  return STATUS_LABELS[status as StateCodeStatus] ?? status.replace(/_/g, ' ')
}

/**
 * One sentence on what a not-in-force status means, in the code's own terms.
 * Facts about the record only: no advice on whether anything is lawful.
 */
export function statusExplanation(row: {
  status?: string | null
  applicable_on?: string | null
  recodified_to?: string | null
}): string | null {
  const s = row.status
  if (s === 'in_force') return null
  switch (s) {
    case 'repealed':
      return 'The code marks this section repealed. It is not in force.'
    case 'expired':
      return 'The code marks this section expired. It is not in force.'
    case 'recodified':
      return 'The code marks this section recodified: it is a placeholder, and its rule has moved to another section.'
    case 'reserved':
      return 'This section number is reserved. It holds no law.'
    case 'transferred':
      return 'The code marks this section transferred to another place. It is not in force here.'
    case 'omitted':
      return 'The code marks this section omitted. It is not in force.'
    case 'sunset':
      return 'This section has passed its sunset date. It is not in force.'
    case 'not_funded':
      return 'The code marks this section not funded. It is not in effect.'
    case 'not_applicable':
      return 'The code marks this section not applicable. It is not in effect.'
    case 'not_yet_applicable':
      return row.applicable_on
        ? `This section applies from ${row.applicable_on}. Until then it is not in force.`
        : 'This section has a future start date. Until then it is not in force.'
    case 'empty':
      return 'This section has no text in the code.'
    default:
      return 'This section’s status could not be read, so it is not shown as in force.'
  }
}

/** The citation for a section number, in the member's own form. */
export function citationFor(member: string | null | undefined, sectionIdentifier: string): string {
  return `${memberCodeName(member)} § ${sectionIdentifier}`
}

/** A row's citation, or one built from its section number. */
export function rowCitation(row: {
  member?: string | null
  citation?: string | null
  section_identifier?: string | null
  id?: number | string
}): string {
  if (row.citation) return row.citation
  if (row.section_identifier) return citationFor(row.member, row.section_identifier)
  return `Section ${row.id ?? ''}`.trim()
}

/** The key that identifies a section across members ('dc:123'). Two members'
 *  ids are separate sequences, so the member has to ride along. */
export function sectionRowKey(r: { member: string; id: number }): string {
  return `${r.member}:${r.id}`
}

/**
 * Reads 'dc:123' or '123' (a member-scoped semantic id, a deep-link id) into
 * a member and a numeric id. `fallbackMember` covers the plain form.
 */
export function parseSectionKey(
  key: string,
  fallbackMember: StateCodesMember,
): { member: string; id: number } | null {
  const m = key.trim().match(/^(?:([a-z][a-z0-9_]*):)?(\d+)$/)
  if (!m) return null
  return { member: m[1] ?? fallbackMember, id: Number(m[2]) }
}

/**
 * What an in-force-only search left out, from the reply's status_counts
 * (counted before the exclusion). Largest first.
 */
export function notInForceBreakdown(
  counts: Partial<Record<string, number>> | null | undefined,
): { total: number; parts: { status: string; count: number }[] } {
  const parts = Object.entries(counts ?? {})
    .filter(([status, n]) => status !== 'in_force' && typeof n === 'number' && n > 0)
    .map(([status, n]) => ({ status, count: n as number }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
  return { total: parts.reduce((t, p) => t + p.count, 0), parts }
}

/** "31 repealed, 4 expired and 1 not funded". */
export function breakdownWords(parts: readonly { status: string; count: number }[]): string {
  const words = parts.map((p) => `${p.count.toLocaleString()} ${statusLabel(p.status).toLowerCase()}`)
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * A semantic (or fallback) result as a section row, so both panes show the
 * same table with the same status flags. The Worker passes the status fields
 * through on every result (ragtime-worker#286); a field it leaves out stays
 * null, and a missing status is flagged (isInForce).
 */
export function semanticRowToSection(
  row: SemanticSearchRow,
  fallbackMember: StateCodesMember,
): StateCodeSectionDisplayRow | null {
  const key = parseSectionKey(row.id, fallbackMember)
  if (!key) return null
  return {
    member: key.member,
    id: key.id,
    citation: row.citation ?? row.title ?? null,
    section_identifier: row.section_identifier ?? null,
    heading: row.context ?? null,
    title_num: row.title_num ?? null,
    title_name: row.title_name ?? null,
    chapter: null,
    status: row.status ?? '',
    recodified_to: row.recodified_to ?? null,
    has_temporary_text: row.has_temporary_text === true,
    applicable_on: row.applicable_on ?? null,
    codified_date: row.codified_date ?? row.date ?? null,
    text_length: null,
  }
}

/** Every semantic result that names a section, as section rows. */
export function semanticRowsToSections(
  rows: readonly SemanticSearchRow[] | undefined,
  fallbackMember: StateCodesMember,
): StateCodeSectionDisplayRow[] {
  return (rows ?? [])
    .map((r) => semanticRowToSection(r, fallbackMember))
    .filter((r): r is StateCodeSectionDisplayRow => r !== null)
}

/** "Title 22 · Criminal Offenses and Penalties." — the name as written, tags kept. */
export function titleLine(row: { title_num?: string | null; title_name?: string | null }): string | null {
  if (!row.title_num && !row.title_name) return null
  if (!row.title_num) return row.title_name ?? null
  return row.title_name ? `Title ${row.title_num} · ${row.title_name}` : `Title ${row.title_num}`
}
