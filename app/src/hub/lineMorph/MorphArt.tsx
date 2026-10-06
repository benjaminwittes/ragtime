import { useId, type CSSProperties } from 'react'
import { UNIT_PX } from '../textLines'
import type { Frame, Measured } from './engine'

/**
 * One frame of the line morph, as the inside of an `<svg>` whose viewBox is the box in `UNIT_PX` units
 * (`0 0 w/UNIT_PX h/UNIT_PX`). The lab nests it in a preview, and `LineMorphText` in the note's own svg.
 *
 * Three things are drawn, bottom to top: the window's flat lines; the morph, masked so its lines give way
 * to the text as it arrives; and the original text, masked in slice by slice. The text is a `foreignObject`
 * set in the same face and box the raster was taken from (`textStyle`), so when the morph ends and the real
 * text takes its place nothing moves.
 *
 * Each mask is a rectangle per row, painted with one gradient that steps between slices. Separate
 * rectangles side by side leave a hairline gap where their opacities differ, and one paint does not.
 */

export type MorphTextStyle = CSSProperties

export default function MorphArt({ m, frame, text, textStyle, ink = 'currentColor' }: { m: Measured; frame: Frame; text: string; textStyle: MorphTextStyle; ink?: string }) {
  const uid = useId().replace(/:/g, '')
  const vw = m.w / UNIT_PX
  const vh = m.h / UNIT_PX
  const mask = (name: 'raw' | 'lines', fill: (row: Frame['rows'][number]) => number[]) => (
    <mask id={`${uid}-${name}`} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
      {frame.rows.map((row, k) =>
        row.slices.length ? (
          <g key={k}>
            <linearGradient id={`${uid}-${name}-${k}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={vw} y2={0}>
              {row.slices.flatMap((sl, i) => [
                <stop key={`${i}a`} offset={sl.l / m.w} stopColor="#fff" stopOpacity={fill(row)[i] ?? 0} />,
                <stop key={`${i}b`} offset={sl.r / m.w} stopColor="#fff" stopOpacity={fill(row)[i] ?? 0} />,
              ])}
            </linearGradient>
            <rect x={0} y={row.y0 / UNIT_PX} width={vw} height={(row.y1 - row.y0) / UNIT_PX} fill={`url(#${uid}-${name}-${k})`} />
          </g>
        ) : null,
      )}
    </mask>
  )

  return (
    <>
      <defs>
        {mask('raw', (row) => row.raw)}
        {mask('lines', (row) => row.lines)}
      </defs>
      <path d={frame.underlay} fill={ink} />
      <g mask={`url(#${uid}-lines)`}>
        <path d={frame.morph} fill={ink} />
      </g>
      <g mask={`url(#${uid}-raw)`}>
        <foreignObject x={0} y={0} width={m.w} height={m.h} transform={`scale(${1 / UNIT_PX})`} style={{ overflow: 'visible' }}>
          <div style={{ boxSizing: 'border-box', width: m.w, color: ink, WebkitTextFillColor: ink, ...textStyle }}>{text}</div>
        </foreignObject>
      </g>
    </>
  )
}
