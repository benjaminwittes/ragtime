import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * How many device pixels the owl is drawn across, which is what decides how fine a screen
 * the engraved style may use. Measured on the owl's own `<svg>` and watched, because the
 * same owl is 24px in the lab and 320px a few rows down, and a window can change its
 * pixel ratio under it.
 *
 * The answer is bucketed on a geometric ladder so that a figure being resized (the hub's
 * owl travelling to the Explorer's, a responsive width) rebuilds its plate a few times
 * and not once a frame.
 */

const RATIO = 1.18

export function bucketPx(px: number): number {
  if (!(px > 0)) return 0
  return Math.round(Math.pow(RATIO, Math.round(Math.log(px) / Math.log(RATIO))))
}

type Entry = { px: number; listeners: Set<(px: number) => void> }

const entries = new WeakMap<Element, Entry>()
let observer: ResizeObserver | undefined

function read(svg: Element, cssWidth?: number): number {
  const w = cssWidth ?? svg.getBoundingClientRect().width
  return bucketPx(w * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
}

function observe(): ResizeObserver {
  observer ??= new ResizeObserver((records) => {
    for (const record of records) {
      const entry = entries.get(record.target)
      if (!entry) continue
      const px = read(record.target, record.contentRect.width)
      if (px !== entry.px) {
        entry.px = px
        for (const fn of entry.listeners) fn(px)
      }
    }
  })
  return observer
}

/** Calls `fn` with the current size now, and again whenever its bucket changes. */
function watch(svg: Element, fn: (px: number) => void): () => void {
  let entry = entries.get(svg)
  if (!entry) {
    entry = { px: read(svg), listeners: new Set() }
    entries.set(svg, entry)
  }
  entry.listeners.add(fn)
  fn(entry.px)
  if (typeof ResizeObserver !== 'undefined') observe().observe(svg)
  return () => {
    const e = entries.get(svg)
    if (!e) return
    e.listeners.delete(fn)
    if (e.listeners.size === 0) {
      observer?.unobserve(svg)
      entries.delete(svg)
    }
  }
}

/**
 * Device pixels across the figure the element is in, or 0 before it has been measured.
 * Measured in a layout effect, so the first paint already has the right answer.
 */
export function useFigurePx(ref: RefObject<SVGElement | null>): number {
  const [px, setPx] = useState(0)
  useLayoutEffect(() => {
    const svg = ref.current?.ownerSVGElement
    return svg ? watch(svg, setPx) : undefined
  }, [ref])
  return px
}
