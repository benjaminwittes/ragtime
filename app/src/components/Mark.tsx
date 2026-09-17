/**
 * The RAGtime mark: fluting — the side of a courthouse column, rendered densely.
 *
 * A figure is a run of widths, flute, groove, flute, groove …, drawn as integer-pixel
 * rects with crisp edges, so what the table says is what the screen draws. Four cuts,
 * one per size the mark is used at, because a fluted figure does not scale: an earlier
 * sketch of eleven 1px rules held at 48px and was a grey block at 16px, where 1px grooves
 * met 1px rules. Every flute here is 2px and every groove at least 2px, at every size.
 * The flutes are one width by ruling — a first cut thinned the outer two to 1px, as a
 * column's edge does, and read as lines of different weights rather than as one figure —
 * so the foreshortening is carried by the grooves alone: from 20px up the centre grooves
 * widen and the outer ones tighten, so the more room the figure has the more it turns.
 * At 16px there is no room for that and the flutes sit at one pitch.
 *
 * No cap, no base, and no tile: it is the side of the column and nothing more, by
 * ruling — a capital would have landed the courthouse literally, and a tile behind the
 * flutes turned them into bars in a frame.
 *
 * `public/favicon.svg` is the 16px cut, kept by hand because a favicon is a static file;
 * if this table changes, that file changes with it.
 */
const CUTS = {
  16: [2, 2, 2, 2, 2, 2, 2], // four flutes, one pitch; 14 wide, centred
  20: [2, 2, 2, 3, 2, 3, 2, 2, 2], // five flutes; the site bar, on the wordmark's baseline
  32: [2, 2, 2, 3, 2, 4, 2, 4, 2, 3, 2, 2, 2], // seven
  48: [2, 2, 2, 2, 2, 2, 2, 3, 2, 4, 2, 4, 2, 3, 2, 2, 2, 2, 2, 2, 2], // eleven
} as const

export type MarkSize = keyof typeof CUTS

export function Mark({
  size = 20,
  className,
  title,
}: {
  size?: MarkSize
  className?: string
  /** Give the mark a name only when it stands alone; beside the wordmark it is decoration. */
  title?: string
}) {
  const run = CUTS[size]
  const flutes: { x: number; w: number }[] = []
  // A run narrower than its box is centred, in whole pixels, so it stays crisp.
  let x = Math.floor((size - run.reduce((a, b) => a + b, 0)) / 2)
  run.forEach((w, i) => {
    if (i % 2 === 0) flutes.push({ x, w })
    x += w
  })
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {flutes.map((f) => (
        <rect key={f.x} x={f.x} y={0} width={f.w} height={size} />
      ))}
    </svg>
  )
}
