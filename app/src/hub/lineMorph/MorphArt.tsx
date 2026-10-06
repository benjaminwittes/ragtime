import { useId } from 'react'
import { UNIT_PX } from '../textLines'
import type { Frame, Measured } from './engine'

/**
 * The lines of one frame of the line morph, as the inside of an `<svg>` whose viewBox is the box in `UNIT_PX`
 * units (`0 0 w/UNIT_PX h/UNIT_PX`): the window's flat lines, and the morph on top of them, masked so its lines
 * give way to the text as it arrives. The text is not drawn here. It is the real text, on top, revealed by
 * `revealMask` (`engine.ts`): a second copy of it in the svg was what could blink, and nothing now needs one.
 *
 * The mask is a rectangle per row, painted with one gradient that steps between slices. Separate rectangles
 * side by side leave a hairline gap where their opacities differ, and one paint does not.
 */
export default function MorphArt({ m, frame, ink = 'currentColor' }: { m: Measured; frame: Frame; ink?: string }) {
  const uid = useId().replace(/:/g, '')
  const vw = m.w / UNIT_PX
  const vh = m.h / UNIT_PX
  return (
    <>
      <defs>
        <mask id={`${uid}-lines`} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
          {frame.rows.map((row, k) =>
            row.slices.length ? (
              <g key={k}>
                <linearGradient id={`${uid}-lines-${k}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={vw} y2={0}>
                  {row.slices.flatMap((sl, i) => [
                    <stop key={`${i}a`} offset={sl.l / m.w} stopColor="#fff" stopOpacity={row.lines[i] ?? 0} />,
                    <stop key={`${i}b`} offset={sl.r / m.w} stopColor="#fff" stopOpacity={row.lines[i] ?? 0} />,
                  ])}
                </linearGradient>
                <rect x={0} y={row.y0 / UNIT_PX} width={vw} height={(row.y1 - row.y0) / UNIT_PX} fill={`url(#${uid}-lines-${k})`} />
              </g>
            ) : null,
          )}
        </mask>
      </defs>
      <path d={frame.underlay} fill={ink} />
      <g mask={`url(#${uid}-lines)`}>
        <path d={frame.morph} fill={ink} />
      </g>
    </>
  )
}
