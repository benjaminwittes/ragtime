import { useLayoutEffect, useState, type DependencyList } from 'react'

/**
 * Something measured from a laid-out element, kept current: measured at once, and again, a frame later,
 * when the element is resized or the web font arrives (the words are the same then but the shapes are not).
 * `host` is read in the effect, so it can be a ref's current or its parent. `measure` is called with the
 * element and returns null where there is nothing to measure yet; `deps` are what a change in should
 * measure again (the text, the pitch), as in an effect's.
 */
export function useMeasured<T>(host: () => HTMLElement | null | undefined, measure: (el: HTMLElement) => T | null, deps: DependencyList): T | null {
  const [measured, setMeasured] = useState<T | null>(null)

  useLayoutEffect(() => {
    const el = host()
    if (!el) return
    let raf = 0
    const draw = () => {
      const next = measure(el)
      if (next) setMeasured(next)
    }
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(later)
    ro.observe(el)
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return measured
}
