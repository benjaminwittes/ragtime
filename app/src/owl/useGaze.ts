import { useEffect, type RefObject } from 'react'
import { lookOwlAt } from './contract'

/**
 * Make an owl's eyes follow the pointer.
 *
 * Only the listener lives here: the arithmetic is `gaze.ts`, and turning an owl toward a
 * point — shared with the stage's mirror, which turns a copy of the owl toward the
 * presenter's pointer — is `lookOwlAt` in `contract.ts`.
 *
 * Every following owl shares one `pointermove` listener and one animation frame, and only
 * the owls on (or just off) the screen are turned: a page with dozens of owls would
 * otherwise restyle every one of them on every pointer move, seen or not. An owl that
 * scrolls into view is turned toward the last known pointer position at that moment.
 */

const following = new Set<SVGSVGElement>()
const visible = new Set<SVGSVGElement>()
let pointer: { x: number; y: number } | null = null
let frame = 0
let observer: IntersectionObserver | null = null

function look() {
  frame = 0
  // Written to the elements rather than to state: this runs on every pointer move,
  // and a render per move for two circles would be the costliest thing on the page.
  if (pointer) for (const el of visible) lookOwlAt(el, pointer)
}

function onMove(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY }
  if (!frame) frame = requestAnimationFrame(look)
}

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const { target, isIntersecting } of entries) {
    const el = target as SVGSVGElement
    if (!isIntersecting) {
      visible.delete(el)
    } else {
      visible.add(el)
      if (pointer) lookOwlAt(el, pointer)
    }
  }
}

function add(el: SVGSVGElement) {
  if (following.size === 0) window.addEventListener('pointermove', onMove, { passive: true })
  following.add(el)
  if (typeof IntersectionObserver === 'undefined') {
    visible.add(el)
    return
  }
  observer ??= new IntersectionObserver(onIntersect, { rootMargin: '120px' })
  observer.observe(el)
}

function remove(el: SVGSVGElement) {
  following.delete(el)
  visible.delete(el)
  observer?.unobserve(el)
  if (following.size === 0) {
    window.removeEventListener('pointermove', onMove)
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    observer?.disconnect()
    observer = null
    // With no listener the pointer is no longer being followed, so the last position seen
    // is stale: an owl that arrives later must start straight ahead, as it did before the
    // listener was shared, and not turn to wherever the pointer was a page ago.
    pointer = null
  }
}

export function useGaze(svg: RefObject<SVGSVGElement | null>, follow: boolean): void {
  useEffect(() => {
    const el = svg.current
    if (!el || !follow) return
    // Nothing to follow on a touch screen, and nothing that should move for a reader who
    // asked for stillness. Both are read once: an owl that starts following because a
    // mouse was plugged in mid-visit is not worth a listener on two media queries.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    add(el)
    return () => remove(el)
  }, [svg, follow])
}
