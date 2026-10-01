import { MARK } from './config.ts'
import type { RGB } from './glyph.ts'

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/**
 * How one letter looks, given `d`: how many px it sits behind the brush's text edge.
 * It appears over `edge` px, in the mark's colour, then settles to ink over `solid` px.
 */
export function letterLook(d: number): { opacity: number; settle: number } {
  return { opacity: smooth(d / MARK.edge), settle: smooth((d - MARK.edge) / MARK.solid) }
}

/** The CSS colour a letter wears at `settle` (0 = the mark's colour, 1 = ink); '' once it is ink, so the page's own colour rules again. */
export function letterColor(teal: RGB, ink: RGB, settle: number): string {
  if (settle >= 1) return ''
  const m = (i: 0 | 1 | 2) => Math.round(teal[i] + (ink[i] - teal[i]) * settle)
  return `rgb(${m(0)},${m(1)},${m(2)})`
}

export type Box = { left: number; right: number; top: number; bottom: number }

/**
 * Number the lines of a run of letters in reading order. A new line starts when a letter's
 * vertical centre falls below the previous letter's bottom edge, or when it sits left of it
 * (a wrap inside one block); this is how letters in a list, a table cell and a paragraph
 * all land on the one path the brush walks.
 */
export function lineIds(boxes: readonly Box[]): number[] {
  const out: number[] = []
  let line = 0
  let prev: Box | null = null
  for (const b of boxes) {
    if (prev) {
      const mid = (b.top + b.bottom) / 2
      if (mid > prev.bottom || b.left < prev.left - 1) line++
    }
    out.push(line)
    prev = b
  }
  return out
}

/**
 * Move the brush `dt` seconds along the letters. `shown` is a fractional index into them: the
 * whole part is the letter the brush is on, the rest how far across it. Speed is in px/s
 * and constant, so a wide letter takes longer than a narrow one and the brush never speeds
 * up or slows down on its own.
 */
export function advance(shown: number, dt: number, widths: readonly number[]): number {
  const last = widths.length
  if (shown >= last) return last
  const w = Math.max(4, widths[Math.min(Math.floor(shown), last - 1)]!)
  return Math.min(last, shown + (MARK.speed / w) * dt)
}

/** Px of brush travel after the last letter before it has finished settling to ink. */
export const SETTLE_RUNWAY = MARK.edge + MARK.solid + MARK.lead + 4
