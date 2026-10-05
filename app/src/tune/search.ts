import type { Tunable } from '@/tune/types'

/**
 * Which settings a typed query finds: a pure function of the knobs and the words, so it is
 * tested in node (`search.test.ts`). Every word must match something about the knob; the score
 * says how much it matters where. A word that is the start of the knob's scope ("owl") or group
 * pulls in everything under it, which is how typing the name of a thing lists its settings.
 */

export type Candidate = { knob: Tunable; scope: string }

export function words(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** 0 for no match; otherwise the higher, the better. `scope` is the label the reader sees for the knob's surface. */
export function score(knob: Tunable, scope: string, query: string): number {
  const ws = words(query)
  if (ws.length === 0) return 0
  const where = {
    scope: words(scope + ' ' + knob.scope),
    group: words(knob.group),
    label: words(knob.label),
    rest: words((knob.note ?? '') + ' ' + knob.id),
  }
  let total = 0
  for (const w of ws) {
    const starts = (list: string[]) => list.some((x) => x.startsWith(w))
    const best = starts(where.scope) ? 6 : starts(where.label) ? 5 : starts(where.group) ? 4 : where.rest.some((x) => x.includes(w)) ? 1 : 0
    if (best === 0) return 0
    total += best
  }
  return total
}

/** The candidates the query finds, best first; readers' settings ahead of the tuner's on a tie. */
export function find(candidates: readonly Candidate[], query: string): Candidate[] {
  return candidates
    .map((c, order) => ({ c, order, s: score(c.knob, c.scope, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || Number(!!b.c.knob.user) - Number(!!a.c.knob.user) || a.order - b.order)
    .map((r) => r.c)
}
