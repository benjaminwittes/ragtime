import { linesFromGrid, rasterizeText, type Grid } from '../textLines'

/**
 * The line morph: text written as lines. One window of flat lines sweeps across each row of the text; on top
 * of those lines a halftone swells where the letters are, and then the original text takes over.
 *
 * Everything here is arithmetic over a raster of the text and returns strings and numbers: the drawing is
 * `MorphArt.tsx`, the playing is `LineMorphText.tsx`, and the lab (`owl/lab/LineLab.tsx`) is where the
 * numbers are found. There is no DOM in this file apart from `measureMorph`, which reads it.
 *
 * How a frame is made, for one row of text and a time `t` from 0 to 1:
 *
 *   - **The window** is a block of flat lines, fixed for a given `t`: it enters just off the left of the row,
 *     crosses it, and leaves past the end. Behind its trailing edge the lines thin out over `trail`
 *     window-widths, and ahead of its leading edge they thin in over `entry`, the same taper mirrored.
 *   - **The band** is the morph, laid across the window by position. At its start edge a column is still
 *     flat lines; `ramp` window-widths behind that it is the original text. The start edge is the window's
 *     leading edge moved by `shift`. The band never moves the window.
 *   - **Three phases** per column along the band: flat lines turn into halftone (the lines swell where the
 *     letters are), the halftone holds, then it turns into the original text. The first and last 15% of `t`
 *     ease `shift` to zero, so `t = 0` is always empty and `t = 1` is always the finished text.
 *   - **Pieces** cut each letter into slices that turn one at a time, so the change runs through a letter.
 *   - **Rows** run in sequence: each row has its own `t`, started `stagger` of a row's length after the last.
 *   - **One speed.** Lengths are in em (the type size) and the swipe is `speed` em a second, so a long text
 *     takes longer and a short one less, and the window, the band and the pace look the same on both.
 */

export type Letter = { l: number; r: number; row: number } | null
export type Row = { y0: number; y1: number }
export type Slice = { l: number; r: number; row: number }

/** The text as the browser set it: its raster, where each letter and row sits, and the line spacing. */
export type Measured = { grid: Grid; w: number; h: number; spacing: number; letters: Letter[]; rows: Row[]; /** The type size in px: one em. */ size: number }

export type MorphParams = {
  /** Weight (0 to 1) of the window's flat lines. */
  cover: number
  /** Window width, in em (the type size). */
  winWidth: number
  /** False lets the lines run the whole box, which is what a still preview wants. */
  windowOn: boolean
  /** How far a letter's tone spreads into the lines around it, in em, so it is the same share of the letter at any size. */
  spread: number
  /** Multiplier on that tone. */
  gain: number
  /** Band length, in window widths. */
  ramp: number
  /** Slides the band against the window, in window widths. */
  shift: number
  /** How far behind the trailing edge the lines thin out, in window widths. */
  trail: number
  /** How far ahead of the leading edge the lines thin in, in window widths. */
  entry: number
  /** The swipe's pace, in em a second: the window crosses this many type sizes each second, whatever the text. */
  speed: number
  /** Slices per letter. */
  pieces: number
  /** How far one row's start is behind the last, as a fraction of the last row's own time: 0 all at once, 1 one after another. */
  stagger: number
}

/** Opacity of each slice's raw text, and of each slice's lines, for the drawing to mask by. */
export type RowSteps = { y0: number; y1: number; slices: Slice[]; raw: number[]; lines: number[] }
export type Frame = { underlay: string; morph: string; rows: RowSteps[]; finished: boolean }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Flat lines → halftone: the first 35% of a column's progress. */
export const toHalftone = (p: number) => Math.min(1, p / 0.35)
/** Halftone → the original text: the last 35%. */
export const toRaw = (p: number) => clamp01((p - 0.65) / 0.35)
/** The lines give way to the text from 40% of the way through that last phase. */
export const lineWeight = (raw: number) => 1 - clamp01((raw - 0.4) / 0.6)

/** A box blur, separable, so a letter's tone spreads into the lines around it. */
export function blur(data: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return data
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length)
    const n = horizontal ? w : h
    const lines = horizontal ? h : w
    for (let k = 0; k < lines; k++) {
      let sum = 0
      const at = (i: number) => (horizontal ? k * w + i : i * w + k)
      for (let i = -r; i <= r; i++) sum += src[at(Math.min(n - 1, Math.max(0, i)))]
      for (let i = 0; i < n; i++) {
        out[at(i)] = sum / (2 * r + 1)
        sum += src[at(Math.min(n - 1, i + r + 1))] - src[at(Math.max(0, i - r))]
      }
    }
    return out
  }
  return pass(pass(data, true), false)
}

/** The text's tone for the halftone: the raster, spread (`spread` em) and scaled. */
export function toneOf(m: Measured, spread: number, gain: number): Float32Array {
  return blur(m.grid.data, m.w, m.h, Math.round(spread * m.size)).map((v) => Math.min(1, v * gain))
}

/**
 * Lay out `host`'s text: rasterize it, and find each letter's box and the rows they fall in. `pitch` is the
 * line spacing at the desktop title size, and scales with the host's font size, so a small note has finer lines.
 */
export function measureMorph(host: HTMLElement, pitch: number): Measured | null {
  const grid = rasterizeText(host)
  if (!grid) return null
  const size = parseFloat(getComputedStyle(host).fontSize) || 52
  const spacing = Math.max(1.5, (pitch * size) / 52)
  const node = [...host.childNodes].find((n) => n.nodeType === 3)
  const box = host.getBoundingClientRect()
  const range = document.createRange()
  const rects: ({ l: number; r: number; top: number; bottom: number } | null)[] = [...(node?.textContent ?? '')].map((ch, i) => {
    if (!node || /\s/.test(ch)) return null
    range.setStart(node, i)
    range.setEnd(node, i + 1)
    const rect = range.getClientRects()[0]
    return rect ? { l: rect.left - box.left, r: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top } : null
  })
  const { letters, rows } = groupRows(rects, grid.h)
  return { grid, w: grid.w, h: grid.h, spacing, letters, rows, size }
}

/**
 * Group letter boxes into rows: a letter starts a new row when it sits lower than half the previous row's
 * height. Each row owns the band of the raster from halfway to its neighbours, so the bands tile the box.
 */
export function groupRows(rects: ({ l: number; r: number; top: number; bottom: number } | null)[], height: number): { letters: Letter[]; rows: Row[] } {
  const spans: { top: number; bottom: number }[] = []
  const letters: Letter[] = rects.map((rect) => {
    if (!rect) return null
    let row = spans.findIndex((s) => Math.abs((rect.top + rect.bottom) / 2 - (s.top + s.bottom) / 2) < (s.bottom - s.top) / 2)
    if (row === -1) {
      spans.push({ top: rect.top, bottom: rect.bottom })
      row = spans.length - 1
    } else {
      spans[row] = { top: Math.min(spans[row].top, rect.top), bottom: Math.max(spans[row].bottom, rect.bottom) }
    }
    return { l: rect.l, r: rect.r, row }
  })
  // Order rows top to bottom, and renumber the letters to match.
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].top - spans[b].top)
  const rank = new Map(order.map((old, i) => [old, i]))
  const sorted = order.map((old) => spans[old])
  const rows: Row[] = sorted.map((s, i) => ({
    y0: i === 0 ? 0 : Math.round((sorted[i - 1].bottom + s.top) / 2),
    y1: i === sorted.length - 1 ? height : Math.round((s.bottom + sorted[i + 1].top) / 2),
  }))
  return {
    letters: letters.map((lt) => (lt ? { ...lt, row: rank.get(lt.row) ?? 0 } : null)),
    rows: rows.length ? rows : [{ y0: 0, y1: height }],
  }
}

/** Each letter cut into `pieces` equal slices. */
export function slicesOf(letters: Letter[], pieces: number): Slice[] {
  const n = Math.max(1, Math.round(pieces))
  const out: Slice[] = []
  for (const lt of letters) {
    if (!lt) continue
    const step = (lt.r - lt.l) / n
    for (let k = 0; k < n; k++) out.push({ l: lt.l + k * step, r: lt.l + (k + 1) * step, row: lt.row })
  }
  return out
}

/** How long the finished text is left standing before the morph ends and the real text takes its place. */
export const HOLD_SECONDS = 0.12

/** The window's travel for one row, in px, measured from the left edge of the box. */
export function sweep(wordEnd: number, p: MorphParams, size: number) {
  const winPx = p.winWidth * size
  const bandPx = Math.max(1, p.ramp * winPx)
  // The entry taper reaches `entry` window-widths ahead of the leading edge, so the sweep starts that far left.
  const startPx = -winPx * (1 + p.entry)
  // At the end the whole band is past the last slice and the lines, trail included, have cleared the word, and
  // the text has then stood finished for a beat (`HOLD_SECONDS`), so the swap to the real text changes nothing you can see.
  const finishPx = Math.max(wordEnd + bandPx - winPx, wordEnd + p.trail * winPx) + HOLD_SECONDS * p.speed * size
  return { winPx, bandPx, startPx, finishPx }
}

/** How long each row takes, when it starts, and how long the whole thing takes, all in seconds. */
export type Timing = { starts: number[]; durations: number[]; total: number }

/**
 * One pace for every text: a row takes as long as its sweep is long at `speed` em a second. A row starts
 * `stagger` of the row above's time after that one did. The whole takes until the last row has finished.
 */
export function timing(m: Measured, p: MorphParams): Timing {
  const pxPerSecond = Math.max(1e-6, p.speed * m.size)
  const ends = m.rows.map((_, k) => m.letters.reduce((e, lt) => (lt && lt.row === k ? Math.max(e, lt.r) : e), 0))
  const durations = ends.map((end) => {
    const s = sweep(end, p, m.size)
    return (s.finishPx - s.startPx) / pxPerSecond
  })
  const starts: number[] = []
  durations.forEach((_, k) => starts.push(k === 0 ? 0 : starts[k - 1] + p.stagger * durations[k - 1]))
  return { starts, durations, total: Math.max(0, ...starts.map((s, k) => s + durations[k])) }
}

/** Each row's own time (0 to 1) at `seconds` into the whole. */
export function rowTimes(tm: Timing, seconds: number): number[] {
  // Rounding must not leave a row a hair short of finished: the last frame has to be the text and nothing else.
  return tm.durations.map((d, k) => {
    const v = clamp01((seconds - tm.starts[k]) / Math.max(1e-9, d))
    return v > 1 - 1e-9 ? 1 : v < 1e-9 ? 0 : v
  })
}

/** Where the window is, and how long the band is, for one row at its own time `t`. In px. */
export type Geometry = { loPx: number; hiPx: number; shiftNow: number; winPx: number; bandPx: number }

export function geometry(wordEnd: number, p: MorphParams, size: number, t: number): Geometry {
  const { winPx, bandPx, startPx, finishPx } = sweep(wordEnd, p, size)
  const loPx = startPx + t * (finishPx - startPx)
  // `shift` is eased to zero over the first and last 15% of the row's time.
  const shiftNow = p.shift * Math.min(1, t / 0.15, (1 - t) / 0.15) + 0
  return { loPx, hiPx: loPx + winPx, shiftNow, winPx, bandPx }
}

/** The morph's progress (0 flat lines, 1 the text) at column `x`. */
export const bandAt = (g: Geometry, x: number) => clamp01((g.hiPx + g.shiftNow * g.winPx - x) / g.bandPx)

/**
 * One frame, `t` (0 to 1) of the way through the whole (`timing(m, p).total` seconds). `toned` is
 * `toneOf(m, spread, gain)`, which only changes with those two.
 */
export function frameAt(m: Measured, toned: Float32Array, p: MorphParams, t: number): Frame {
  const { w, h, grid, spacing } = m
  const rows = m.rows
  const slices = slicesOf(m.letters, p.pieces)
  const tm = timing(m, p)
  const times = rowTimes(tm, t * tm.total)
  const morph = new Float32Array(w * h)
  const under = new Float32Array(w * h)
  const steps: RowSteps[] = []

  rows.forEach((row, k) => {
    const mine = slices.filter((sl) => sl.row === k)
    const wordEnd = mine.reduce((e, sl) => Math.max(e, sl.r), 0)
    const g = geometry(wordEnd, p, m.size, times[k])
    const hiPx = Math.round(g.hiPx)
    const loPx = Math.round(g.loPx)
    const tailPx = Math.max(1, p.trail * g.winPx)
    const headPx = Math.max(1, p.entry * g.winPx)

    // One progress value per column, held across a slice so the pieces still step through each letter.
    const col = new Float32Array(w)
    for (let x = 0; x < w; x++) col[x] = bandAt(g, x)
    const progress = mine.map((sl) => bandAt(g, (sl.l + sl.r) / 2))
    mine.forEach((sl, i) => {
      for (let x = Math.max(0, Math.floor(sl.l)); x < Math.min(w, Math.ceil(sl.r)); x++) col[x] = progress[i]
    })
    // The window's lines: full inside, tapering behind the trailing edge and ahead of the leading edge.
    const lines = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      if (!p.windowOn) lines[x] = p.cover
      // No lines where this row has no words: the box is usually wider than a row, and lines left out there would
      // all vanish at once when the morph ends.
      else if (x >= wordEnd) lines[x] = 0
      else if (x >= hiPx) lines[x] = p.cover * Math.max(0, 1 - (x - hiPx) / headPx)
      else if (x >= loPx) lines[x] = p.cover
      else lines[x] = p.cover * Math.max(0, 1 - (loPx - x) / tailPx)
    }

    for (let y = row.y0; y < Math.min(h, row.y1); y++) {
      under.set(lines, y * w)
      for (let x = 0; x < w; x++) {
        if (p.windowOn && x >= hiPx) continue
        const i = y * w + x
        const a = toHalftone(col[x])
        const r = toRaw(col[x])
        const solid = grid.data[i] > 0.2 ? 1 : 0
        // The flat lines are the window's own underlay, so the morph starts from nothing and only adds.
        const f = toned[i] * a
        morph[i] = f + (solid - f) * r
      }
    }
    const raw = progress.map(toRaw)
    steps.push({ y0: row.y0, y1: Math.min(h, row.y1), slices: mine, raw, lines: raw.map(lineWeight) })
  })

  return {
    underlay: linesFromGrid({ w, h, data: under }, spacing),
    morph: linesFromGrid({ w, h, data: morph }, spacing),
    rows: steps,
    finished: t >= 1,
  }
}
