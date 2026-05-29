/**
 * Helpers for detecting the salvage-on-parse-failure marker (PR 4w).
 *
 * The Worker's `salvageTruncatedSynthesis` adds a candor note that begins
 * with this exact prefix when it recovers a truncated narrative. The UI
 * uses it to: (a) render a prominent TruncationBanner above the prose
 * instead of mixing the warning into the regular candor-notes block, and
 * (b) filter the marker out of the normal candor list so the same text
 * doesn't appear twice.
 *
 * Lives in a separate `.ts` file (not `TruncationBanner.tsx`) so the
 * Vite Fast Refresh boundary stays clean — a `.tsx` file should only
 * export components per the `react-refresh/only-export-components` rule.
 */

const MARKER_PREFIX = 'Synthesis output was truncated mid-generation'

export function isTruncationCandor(note: string): boolean {
  return typeof note === 'string' && note.startsWith(MARKER_PREFIX)
}

export function filterTruncationMarker(
  notes: readonly string[],
): string[] {
  return notes.filter((n) => !isTruncationCandor(n))
}
