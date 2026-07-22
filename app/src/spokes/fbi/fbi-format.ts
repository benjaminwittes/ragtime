/**
 * Non-component formatting helpers shared across the FBI Records spoke's
 * components (kept out of the .tsx files so react-refresh sees
 * component-only modules — the congress-format.ts precedent).
 */

/**
 * The collection line for a row: prefer the Worker's normalized
 * `collection_display` (trimmed, de-slugged); fall back to the trimmed raw
 * value. NEVER use the result of this for filtering — filters round-trip
 * the RAW stored value.
 */
export function fbiCollectionLabel(row: {
  collection: string | null
  collection_display?: string | null
}): string | null {
  const display = row.collection_display?.trim()
  if (display) return display
  const raw = row.collection?.trim()
  return raw || null
}

/**
 * '2012-09-27 16:32:53+00' → '2012-09-27'. The Wayback capture timestamp is
 * a provenance fact about OUR copy (when the Wayback Machine captured the
 * removed document) — never a document date; this corpus has none.
 */
export function formatWaybackDate(ts: string | null): string | null {
  if (!ts) return null
  const m = ts.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ts
}

/** 'wayback-recovered' guard — the one provenance value that gets a badge. */
export function isWaybackRecovered(provenance: string | null | undefined): boolean {
  return provenance === 'wayback-recovered'
}
