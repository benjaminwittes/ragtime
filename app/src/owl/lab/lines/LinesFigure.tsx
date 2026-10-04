import { useEffect, useMemo, useRef } from 'react'
import { baseDesign } from '../../design'
import { computeLines, presetFor, type LineParams } from './engine'
import type { LineKnobs, LineSubject } from './knobs'
import { lanternField, type LampState } from './fields'
import { OWLS, owlField } from './owls'

const BOUNDS: Record<LineSubject, LineParams['bounds']> = {
  c: { x0: 6, y0: 6, x1: 94, y1: 94 },
  lantern: { x0: 12, y0: 12, x1: 88, y1: 88 },
}

function draw(subject: LineSubject, size: number, knobs: LineKnobs, t: number, state: LampState): string {
  const preset = presetFor(size)
  const params: LineParams = {
    ...knobs,
    size,
    lines: knobs.lines > 0 ? knobs.lines : preset.lines,
    pitchPx: preset.pitchPx * knobs.pitch,
    tile: preset.tile * knobs.tile,
    snapPx: knobs.snapPx,
    bounds: BOUNDS[subject],
  }
  const spec = OWLS.find((o) => o.id === subject)
  const field = spec ? owlField(spec, t, state, size) : lanternField(t, state)
  return computeLines(field, params).d
}

const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One specimen. A held one draws once, at `still` seconds (an open eye, the lantern lit);
 * a moving one writes the path's `d` straight from a frame loop, with no React in it, and
 * only while it is on screen.
 */
export function LinesFigure({
  subject,
  size,
  state,
  moving,
  knobs,
  still = 0,
}: {
  subject: LineSubject
  size: number
  state: LampState
  moving: boolean
  knobs: LineKnobs
  still?: number
}) {
  const ref = useRef<SVGPathElement>(null)
  const ink = baseDesign().palette.navy
  const first = useMemo(() => draw(subject, size, knobs, still, state), [subject, size, knobs, still, state])

  useEffect(() => {
    const path = ref.current
    if (!moving || !path || REDUCED()) return
    let raf = 0
    let visible = true
    const start = performance.now()
    const tick = () => {
      if (visible) path.setAttribute('d', draw(subject, size, knobs, (performance.now() - start) / 1000, state))
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(path.ownerSVGElement ?? path)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [moving, subject, size, knobs, state])

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="block" style={{ color: ink }}>
      <path ref={ref} d={first} fill="currentColor" />
    </svg>
  )
}
