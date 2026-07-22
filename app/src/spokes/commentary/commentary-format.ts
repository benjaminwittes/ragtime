/**
 * Non-component helpers shared across the Commentary spoke's components (kept
 * out of the .tsx files so react-refresh sees component-only modules — same
 * rationale as congress-format.ts).
 */

/** Publication-qualified key ('lawfare:123') — the shape the semantic pane and
 *  the union filter share, used for cross-pane overlap badging and React keys.
 *  The two publications' bigint ids collide, so the publication has to ride
 *  along in any key that spans both. */
export function commentaryRowKey(r: {
  publication: string
  id: number
}): string {
  return `${r.publication}:${r.id}`
}
