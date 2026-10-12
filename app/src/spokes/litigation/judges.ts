/**
 * The Judge field, which takes more than one name.
 *
 * CourtListener has no judge pick-list for dockets, so the litigation filter's Judge field is
 * a text box matched by name (`assignedTo`). A reader asked, through the site's Feedback
 * button on 2026-10-01, to filter on more than one judge at a time. Names are separated by
 * commas or semicolons; the worker takes `judge` as one string or an array of strings and
 * matches any of them (ragtime-worker, `clJudgeClause`).
 */

/** The names typed into the field, trimmed, in order, without blanks or repeats. */
export function splitJudges(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[,;]/)) {
    const name = part.trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/**
 * The `judge` wire field for what was typed: absent when empty, a string for one judge (the
 * shape the worker always took, so a single name reaches an older worker unchanged), a list
 * for several.
 */
export function judgeField(text: string): { judge?: string | string[] } {
  const names = splitJudges(text)
  if (!names.length) return {}
  return { judge: names.length === 1 ? names[0] : names }
}

/** The judge or judges a filter page carries, for its label. */
export function judgeLabel(judge: string | string[] | undefined): string {
  if (!judge) return ''
  return (Array.isArray(judge) ? judge : [judge]).map((j) => j.trim()).filter(Boolean).join(', ')
}
