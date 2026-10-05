import { useEffect, useRef, useState } from 'react'
import { DEFAULT_KNOBS } from './knobs'
import type { OwlFigureProps } from '../../types'
import { PrintLines } from './PrintLines'
import { useTunable } from '@/tune/useTunable'
import { PRINT_APP, PRINT_ON } from './print'

/**
 * The line-tile owl as the app draws it: one `PrintLines`, sized by the page's classes like
 * every other owl, with the lines drawn for the width the box has (to the nearest 8px, so a
 * resize is not a redraw per pixel).
 *
 * The scan finish is for sizes where hatching is read as hatching; below that the filter
 * only blurs it.
 */

const SCAN_FROM = 80

export function LinesFigure({ design, poseId, lantern, className, style, title }: OwlFigureProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState(112)
  // The svg is sized by `className`, so the width to draw for is read from it.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const read = () => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) setSize(Math.max(24, Math.round(w / 8) * 8))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])
  const motion = useTunable<string>('owl.lines.motion')
  const scan = useTunable<boolean>('owl.lines.scan')
  const bar = useTunable<boolean>('owl.lines.bar')
  const print = { ...(motion === 'lively' ? PRINT_ON : PRINT_APP), scan: scan && size >= SCAN_FROM, bar }
  return (
    <PrintLines
      subject="c"
      size={size}
      state={lantern}
      knobs={DEFAULT_KNOBS}
      print={print}
      moving={motion !== 'still'}
      ink={design.palette.navy}
      fluid={{ ref: svgRef, className: className ? 'owl ' + className : 'owl', style, title, root: { 'data-owl': poseId, 'data-lantern': lantern } }}
    />
  )
}
