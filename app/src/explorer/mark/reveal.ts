import { MARK } from './config.ts'

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

/** One line of the answer as the brush walks it: where it starts and ends, and its top and bottom. */
export type Line = { left: number; right: number; top: number; bottom: number }

/**
 * The lines of an answer, in reading order, from the boxes of its runs of text. A run is
 * whatever the browser laid out in one piece — a paragraph's worth of a line, a link, a
 * table cell — and `lineIds` says which of them share a line.
 */
export function linesOf(boxes: readonly Box[]): Line[] {
  const ids = lineIds(boxes)
  const lines: Line[] = []
  boxes.forEach((b, i) => {
    const line = lines[ids[i]!]
    if (!line) lines[ids[i]!] = { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    else {
      line.left = Math.min(line.left, b.left)
      line.right = Math.max(line.right, b.right)
      line.top = Math.min(line.top, b.top)
      line.bottom = Math.max(line.bottom, b.bottom)
    }
  })
  return lines
}

/** How long a line is for the brush. Never nothing: a line that is one narrow letter still has to be crossed. */
const span = (line: Line) => Math.max(1, line.right - line.left)

/** The whole distance the brush has to travel to write these lines, in px. */
export function pathLength(lines: readonly Line[]): number {
  return lines.reduce((sum, line) => sum + span(line), 0)
}

/**
 * Where the brush is after `shown` px of travel: which line, and how far along it. Past
 * the end it is at the end of the last line; with no lines it is nowhere.
 */
export function locate(lines: readonly Line[], shown: number): { line: number; x: number } | null {
  if (!lines.length) return null
  let left = Math.max(0, shown)
  for (let i = 0; i < lines.length; i++) {
    const w = span(lines[i]!)
    if (left < w || i === lines.length - 1) return { line: i, x: lines[i]!.left + Math.min(left, w) }
    left -= w
  }
  return null
}

/**
 * Move the brush `dt` seconds toward `total`, the end of what has arrived. It never goes
 * back, never passes the end, and never dawdles: it covers at least the floor speed, and
 * more when there is more to cover — a share of what is left that closes all of it in
 * about `catchUp` seconds. An answer that streams is written as it streams; one that is
 * already there is crossed almost at once.
 */
export function advance(shown: number, total: number, dt: number): number {
  if (shown >= total) return shown
  const left = total - shown
  const step = Math.max(MARK.speed * dt, left * (1 - Math.exp(-dt / MARK.catchUp)))
  return Math.min(total, shown + step)
}

/** Px the brush runs on after the last letter, so the fade and the wash behind it pass off the end of the text. */
export const SETTLE_RUNWAY = MARK.edge + MARK.solid + MARK.lead + 4
