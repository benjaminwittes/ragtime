import type { CommentaryCitation, CongressCollection, SanctionsAmaSynthesis } from '@lawfare/ragtime-client'

import type { SaveItem } from '@/lib/recordbench-save'
import { parseCitedId } from '../congress/congress-format'

/**
 * The documents an AI search report cites, as the bench reads them, for "Save this report
 * and its sources to Recordbench" (`lib/recordbench-save.ts`). Each corpus's report names
 * what it cites its own way; these put each one into the `rt://<corpus>/<id>` form its
 * list button already hands over. A report that cites nothing gives an empty list, and the
 * button then renders nothing.
 */

/** A corpus whose ids are bare numbers: usc, cfr, olc, frus, presidential, fr, fbi. */
export function bareCited(corpus: string, ids: readonly (string | number)[] | null | undefined): SaveItem[] {
  return (ids ?? []).map((id) => ({ corpus, id }))
}

/**
 * Congress cites collection-qualified ids, or bare ones that belong to the collection the
 * question was scoped to. A bare id with no scope names no document and is left out.
 */
export function congressCited(
  ids: readonly (string | number)[] | null | undefined,
  scope: CongressCollection | null,
): SaveItem[] {
  const items: SaveItem[] = []
  for (const raw of ids ?? []) {
    const parsed = parseCitedId(raw, scope)
    if (parsed) items.push({ corpus: 'congress', id: `${parsed.collection}:${parsed.id}` })
  }
  return items
}

/** Commentary cites each piece with its publication. */
export function commentaryCited(cited: readonly CommentaryCitation[] | null | undefined): SaveItem[] {
  return (cited ?? []).map((c) => ({ corpus: 'commentary', id: `${c.publication}:${c.id}` }))
}

/**
 * Sanctions cites qualified passages on its prose branch, and the bench fetches the
 * guidance leg alone, as the guidance list's button does. So a report hands over the
 * guidance it cites and leaves out Federal Register passages. The entity branch cites
 * entities and the count branch a dataset, neither of which the bench fetches.
 */
export function sanctionsCited(synthesis: SanctionsAmaSynthesis): SaveItem[] {
  if (synthesis.branch !== 'prose') return []
  return synthesis.source_ids
    .filter((id) => /^(guidance:)?\d+$/.test(id))
    .map((id) => ({ corpus: 'sanctions', id: id.startsWith('guidance:') ? id : `guidance:${id}` }))
}
