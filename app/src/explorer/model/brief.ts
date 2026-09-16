/**
 * The brief as the card edits it (design item 1): a form over the same four
 * fields the worker validates, with the JSON underneath as what is sent —
 * the worker hashes that into the envelope, so what the card shows is what
 * research runs against. Item 8: a follow-up reuses the accepted brief;
 * only an edit makes a new one.
 */

import type { ExplorerBrief } from '@lawfare/ragtime-client'

export function normalizeBrief(b: ExplorerBrief): ExplorerBrief {
  const out: ExplorerBrief = {
    goal: b.goal.trim(),
    corpora: Array.from(new Set(b.corpora.map((c) => c.trim()).filter(Boolean))),
    answer_shape: b.answer_shape.trim(),
  }
  const constraints = (b.constraints ?? []).map((c) => c.trim()).filter(Boolean)
  if (constraints.length) out.constraints = constraints
  return out
}

/** The corpora the user pinned in the empty state go first (item 10). */
export function mergePinnedCorpora(b: ExplorerBrief, pinned: readonly string[]): ExplorerBrief {
  if (!pinned.length) return b
  return normalizeBrief({ ...b, corpora: pinned.concat(b.corpora) })
}

/**
 * What the collapsed "Search in" control reads.
 *
 * The chips fold away, so this is the whole of what a reader is told about a choice they
 * made and can no longer see. That is the one thing collapsing an *input* has to get
 * right — a hidden readout is merely absent, a hidden input that is silently in effect is
 * a lie about what the next turn will do. So a pin is always named, and the control says
 * "optional" only while it really is.
 *
 * Two names, then a count: three long corpus names wrap the control onto the second row
 * this collapse exists to remove, and the count is enough to say "there is more here".
 */
export function pinnedSummary(names: readonly string[]): string {
  if (!names.length) return 'Search in — optional'
  if (names.length <= 2) return 'Search in · ' + names.join(', ')
  return 'Search in · ' + names.slice(0, 2).join(', ') + ' +' + (names.length - 2)
}

/** Stable text for the card's JSON view and for "did the user change it". */
export function briefJson(b: ExplorerBrief): string {
  return JSON.stringify(normalizeBrief(b), null, 2)
}

export function sameBrief(a: ExplorerBrief | null, b: ExplorerBrief | null): boolean {
  if (!a || !b) return a === b
  return briefJson(a) === briefJson(b)
}

export function moveCorpus(corpora: readonly string[], from: number, to: number): string[] {
  const out = corpora.slice()
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out
  const [c] = out.splice(from, 1)
  out.splice(to, 0, c!)
  return out
}
