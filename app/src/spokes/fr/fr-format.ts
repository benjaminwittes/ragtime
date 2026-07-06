/**
 * Non-component formatting helpers shared across the Federal Register
 * spoke's components (kept out of the .tsx files so react-refresh sees
 * component-only modules).
 */

/** 'proposed_rule' → 'Proposed rules', etc. */
export function prettyDocType(s: string): string {
  switch (s) {
    case 'rule':
      return 'Rules'
    case 'proposed_rule':
      return 'Proposed rules'
    case 'notice':
      return 'Notices'
    default:
      return s
  }
}

/**
 * True when a date is today or later (local time) — used for the
 * operative-fact rule: an open comment window (comments_close_on >= today)
 * and a still-future effective date get visual weight.
 */
export function isTodayOrLater(date: string | null): boolean {
  if (!date) return false
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return date >= iso
}
