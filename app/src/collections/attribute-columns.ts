import type { CollectionCaseRow } from '@lawfare/ragtime-client'

/** A collection's curated attribute keys, most-filled first (then by name).
 *  Keys starting `_` are internal bookkeeping, and empty values don't count. */
export function attributeColumns(rows: readonly CollectionCaseRow[]): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.attributes ?? {})) {
      if (k.startsWith('_') || v == null || v === '') continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}
