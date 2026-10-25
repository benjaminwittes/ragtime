/**
 * The line under a corpus page's count when a search ranked only part of its
 * matches (Thomas, 2026-10-25).
 *
 * FRUS is too large to rank every match of a broad search, so the worker ranks
 * the newest `rank_pool` matches by relevance and reports that size; a browse
 * (empty box) reports null. The owner ruled that a broad search is never
 * refused and that the page says when it shows only part of the matches, so
 * when the match count is above the pool this line says so and points at the
 * date fields, which move the pool into earlier years.
 *
 * Returns null when every match was ranked, when nothing was ranked, and
 * against a worker that predates the field.
 */
export function rankPoolLine(
  count: number | undefined,
  rankPool: number | null | undefined,
): string | null {
  if (rankPool == null || count == null || count <= rankPool) return null
  return `Best matches among the newest ${rankPool.toLocaleString()} only. Narrow the dates to reach earlier years.`
}
