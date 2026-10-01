import type { LayerProps, WingSide } from '../../types'

/**
 * The flat style: the owl as the concept sheet draws it — solid shapes, no shading.
 *
 * Every shape and colour is the sheet's own, in the sheet's own 100×100 units, now read
 * from the design rather than written here. Two of the five concepts are drawn, under the
 * names the sheet gave them —
 *
 *   `archivist`  "D · The owl archivist": the owl standing. The avatar, good down to the
 *                size of a line of text.
 *   `stacks`     "E · The owl archivist on the stacks": the same owl on three books. The
 *                one for the landing page.
 *
 * These are the layers `index.ts` assembles into the style, one for each part of the
 * figure (`../../parts.ts`), in the names the engraved style uses for the same parts. They
 * draw the body and nothing the rest of the site depends on. The eyes, the pupils, the
 * glow, the part groups and the root element are the scaffold's (`../../scaffold.tsx`),
 * which is what keeps the DOM contract from drifting between styles.
 */

/** The disc and the books: what the figure stands on. */
export function Ground({ design, pose }: LayerProps) {
  const { palette, stroke, shape } = design
  return (
    <>
      <circle cx="50" cy="50" r={shape.disc} fill={palette.cream} />
      {pose.books.map((b) => (
        <rect
          key={b.y}
          x={b.x}
          y={b.y}
          width={b.width}
          height={shape.bookHeight}
          rx={shape.bookRadius}
          fill={palette.page}
          stroke={palette.navy}
          strokeWidth={stroke.book}
        />
      ))}
    </>
  )
}

export function Body({ design, pose }: LayerProps) {
  return <path d={pose.body} fill={design.palette.navy} />
}

/** The head and the face: what the eyes sit on. */
export function Head({ design, pose }: LayerProps) {
  const { palette } = design
  return (
    <>
      <path d={pose.head} fill={palette.navy} />
      <circle cx="50" cy={pose.face.cy} r={pose.face.r} fill={palette.slate} />
    </>
  )
}

export function Beak({ design, pose }: LayerProps) {
  return <polygon points={pose.beak} fill={design.palette.gold} />
}

export function Belly({ design, pose }: LayerProps) {
  return <ellipse cx="50" cy={pose.belly.cy} rx={pose.belly.rx} ry={pose.belly.ry} fill={design.palette.tan} />
}

export function Wing({ design, pose, side }: LayerProps & { side: WingSide }) {
  const w = pose.wings[side === 'l' ? 0 : 1]
  if (!w) return null
  return <ellipse cx={w.cx} cy={w.cy} rx={w.rx} ry={w.ry} fill={design.palette.wing} />
}

/** Handle, frame and flame, over the glow. */
export function Lantern({ design, pose }: LayerProps) {
  const { palette, stroke, shape } = design
  const { handle, frame, flame } = pose.lantern
  return (
    <>
      <line
        x1={handle.x}
        y1={handle.y1}
        x2={handle.x}
        y2={handle.y2}
        stroke={palette.gold}
        strokeWidth={stroke.handle}
      />
      <rect {...frame} rx={shape.lanternRadius} fill={palette.navy} stroke={palette.gold} strokeWidth={stroke.lantern} />
      <rect className="owl-flame" {...flame} fill={palette.flame} />
    </>
  )
}
