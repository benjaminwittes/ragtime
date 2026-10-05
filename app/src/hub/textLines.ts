import { computeLines, type Field, type LineParams } from '@/owl/styles/lines/engine'

/**
 * A line of type drawn the way the owl is: as parallel lines that thicken and thin with the ink
 * under them (`owl/styles/lines/engine.ts`), here from a raster of the text itself. The
 * rasterising needs a canvas and the DOM; the step from a density grid to a path is plain, and
 * is `linesFromGrid`, tested in node.
 */

/** Units are two screen pixels, so the engine's own proportions (a 100-unit box) hold for a title a thousand wide. */
export const UNIT_PX = 2

export type Grid = { w: number; h: number; data: Float32Array }

/** A field over the grid, in engine units, bilinear so a thin stroke is a gradient and not a staircase. */
export function gridField(grid: Grid): Field {
  const { w, h, data } = grid
  const at = (px: number, py: number) => {
    const x = px < 0 ? 0 : px > w - 1 ? w - 1 : px
    const y = py < 0 ? 0 : py > h - 1 ? h - 1 : py
    return data[Math.round(y) * w + Math.round(x)]!
  }
  return (ux, uy) => {
    const px = ux * UNIT_PX
    const py = uy * UNIT_PX
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    const fx = px - x0
    const fy = py - y0
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }
}

/** The line path (in units) for a density grid, drawn with lines `pitchPx` apart. */
export function linesFromGrid(grid: Grid, pitchPx: number): string {
  const params: LineParams = {
    size: UNIT_PX * 100,
    lines: 1,
    pitchPx,
    tile: 0.9,
    lock: 0,
    bead: 0.25,
    minW: 0,
    maxW: 1.2,
    gamma: 0.8,
    bulge: 0.25,
    cut: 0.05,
    snapPx: 0.35,
    bounds: { x0: 0, y0: 0, x1: grid.w / UNIT_PX, y1: grid.h / UNIT_PX },
  }
  return computeLines(gridField(grid), params).d
}

/**
 * The element's text as a density grid, laid out as the browser laid it: each word is drawn at
 * the rectangle the browser gave it, in the element's own font. Null where there is no canvas.
 */
export function rasterizeText(el: HTMLElement): Grid | null {
  const box = el.getBoundingClientRect()
  const w = Math.max(1, Math.round(box.width))
  const h = Math.max(1, Math.round(box.height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const cs = getComputedStyle(el)
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
  // A hair of blur, so a hairline serif is a pale stroke the engine can thin a line to, not a gap.
  ctx.filter = 'blur(0.5px)'
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
  if (!node || !node.textContent) return { w, h, data: new Float32Array(w * h) }
  const text = node.textContent
  const range = document.createRange()
  const words = /\S+/g
  let m: RegExpExecArray | null
  while ((m = words.exec(text))) {
    range.setStart(node, m.index)
    range.setEnd(node, m.index + m[0].length)
    const r = range.getClientRects()[0]
    if (!r) continue
    const ascent = ctx.measureText(m[0]).fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8
    ctx.fillText(m[0], r.left - box.left, r.top - box.top + ascent)
  }
  const rgba = ctx.getImageData(0, 0, w, h).data
  const data = new Float32Array(w * h)
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3]! / 255
  return { w, h, data }
}
