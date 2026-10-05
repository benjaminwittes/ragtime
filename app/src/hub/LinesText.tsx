import { useLayoutEffect, useRef, useState } from 'react'
import { linesFromGrid, rasterizeText, UNIT_PX } from './textLines'

/**
 * The hub's title, drawn as lines. It renders the sentence as ordinary text (the heading keeps
 * its words, its selection and its place in the layout) and, once it has laid the text out,
 * draws the same words over it as the owl's line tiles and makes the real text transparent.
 * Until then, and wherever there is no canvas, the title is plain type.
 *
 * The lines come from a raster of the text as the browser set it, redone when the sentence
 * changes, the heading is resized, or the web font arrives. Spacing follows the type size, so a
 * phone's smaller title has finer lines and not fewer of them.
 */

type Drawn = { d: string; w: number; h: number; covers: string[] }

/**
 * `covers` is the number of heavier layers drawn over the words, from the heaviest (every line
 * at full thickness, so the words are hidden) to just short of the words' own. A caller sweeps
 * them away in turn to thin the cover to the words (`owl/voice/voice.css`); none is drawn for 0.
 */
export default function LinesText({ text, pitch, photocopy, covers = 0 }: { text: string; pitch: number; photocopy: boolean; covers?: number }) {
  const svg = useRef<SVGSVGElement>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  useLayoutEffect(() => {
    const host = svg.current?.parentElement
    if (!host) return
    let raf = 0
    const draw = () => {
      const grid = rasterizeText(host)
      if (!grid) return
      const size = parseFloat(getComputedStyle(host).fontSize) || 52
      // Two pixels at the desktop title; no finer than a pixel and a half, below which lines blur to grey.
      const spacing = Math.max(1.5, (pitch * size) / 52)
      const heavier = Array.from({ length: covers }, (_, j) => {
        const lift = 1 - j / covers
        const data = Float32Array.from(grid.data, (v) => v + (1 - v) * lift)
        return linesFromGrid({ ...grid, data }, spacing)
      })
      setDrawn({ d: linesFromGrid(grid, spacing), w: grid.w, h: grid.h, covers: heavier })
    }
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(later)
    ro.observe(host)
    // The face may arrive after the first layout; the words are the same but the shapes are not.
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [text, pitch, covers])

  // The real text steps aside only while the lines are there to stand in for it.
  useLayoutEffect(() => {
    const host = svg.current?.parentElement
    if (!host) return
    if (drawn) host.setAttribute('data-lined', 'on')
    return () => host.removeAttribute('data-lined')
  }, [drawn])

  return (
    <>
      {text}
      <svg
        ref={svg}
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute left-0 top-0"
        width={drawn?.w ?? 0}
        height={drawn?.h ?? 0}
        viewBox={drawn ? `0 0 ${drawn.w / UNIT_PX} ${drawn.h / UNIT_PX}` : undefined}
        style={{ overflow: 'visible' }}
      >
        {drawn ? <path d={drawn.d} fill="currentColor" filter={photocopy ? 'url(#hub-print-title)' : undefined} /> : null}
        {drawn?.covers.map((d, j) => (
          <path key={j} d={d} fill="currentColor" className="lines-cover" style={{ '--layer': j } as React.CSSProperties} />
        ))}
      </svg>
    </>
  )
}
