import { useEffect, type RefObject } from 'react'
import { lookOwlAt } from './contract'

/**
 * Make an owl's eyes follow the pointer.
 *
 * Only the listener lives here: the arithmetic is `gaze.ts`, and turning an owl toward a
 * point — shared with the stage's mirror, which turns a copy of the owl toward the
 * presenter's pointer — is `lookOwlAt` in `contract.ts`.
 */
export function useGaze(svg: RefObject<SVGSVGElement | null>, follow: boolean): void {
  useEffect(() => {
    const el = svg.current
    if (!el || !follow) return
    // Nothing to follow on a touch screen, and nothing that should move for a reader who
    // asked for stillness. Both are read once: an owl that starts following because a
    // mouse was plugged in mid-visit is not worth a listener on two media queries.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let x = 0
    let y = 0
    function look() {
      frame = 0
      // Written to the element rather than to state: this runs on every pointer move,
      // and a render per move for two circles would be the costliest thing on the page.
      if (el) lookOwlAt(el, { x, y })
    }
    function onMove(e: PointerEvent) {
      x = e.clientX
      y = e.clientY
      if (!frame) frame = requestAnimationFrame(look)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [svg, follow])
}
