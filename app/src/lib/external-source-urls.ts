/**
 * Constructed external-source URLs for USC + CFR (PR 4x). Brief #1 §4b
 * auditability: every row that mentions a section should carry a
 * one-click path to the canonical primary source.
 *
 * USC and CFR don't store explicit source_url fields in the corpus, but
 * both have deterministic URL patterns that key off `(title_num,
 * section_identifier)` — the parity-target incumbents publish stable
 * URLs:
 *   - USC parity target: uscode.house.gov (brief #3 §0 / §4)
 *   - CFR parity target: eCFR.gov (brief #4 §0 / §4)
 *
 * OLC + FRUS got their links from stored `source_url*` fields in PR 4v;
 * USC + CFR get theirs constructed here. Both link styles work
 * symmetrically in row tables (the ↗ column) and in detail headers
 * (the audit chip).
 */

/** USC section row fields needed for URL construction. */
type UscRowForUrl = {
  title_num: number | null
  section_identifier: string | null
}

/** CFR section row fields needed for URL construction. */
type CfrRowForUrl = {
  title_num: number | null
  section_identifier: string | null
}

/**
 * Build a uscode.house.gov canonical URL for a USC section.
 *
 * URL form:
 *   https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title{N}-section{S}&num=0&edition=prelim
 *
 * `section_identifier` may carry a subsection suffix like `1112(a)`;
 * we strip the parenthesized suffix because the house.gov page is at
 * the section level, not subsection (subsections render on the section
 * page). If either title or section is null, returns null.
 */
export function buildUscSourceUrl(row: UscRowForUrl): string | null {
  if (row.title_num == null) return null
  if (!row.section_identifier) return null
  // Strip subsection suffix (e.g., '1112(a)' → '1112'). The house.gov
  // page is keyed at the section level.
  const section = row.section_identifier.replace(/\(.*$/, '').trim()
  if (!section) return null
  return `https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title${row.title_num}-section${section}&num=0&edition=prelim`
}

/**
 * Build an eCFR.gov canonical URL for a CFR section.
 *
 * URL form (short / permissive):
 *   https://www.ecfr.gov/current/title-{N}/section-{section_identifier}
 *
 * `section_identifier` like `164.502` already includes the part prefix;
 * eCFR resolves the short form to the full path
 * (.../subtitle-X/subchapter-Y/part-N/section-N.S). If either field is
 * null, returns null.
 */
export function buildCfrSourceUrl(row: CfrRowForUrl): string | null {
  if (row.title_num == null) return null
  if (!row.section_identifier) return null
  return `https://www.ecfr.gov/current/title-${row.title_num}/section-${row.section_identifier}`
}
