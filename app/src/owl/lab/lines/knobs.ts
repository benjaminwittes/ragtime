import { DEFAULT_LINE_STYLE } from './engine'

/** What the section's controls move; everything else comes from the size (`presetFor`). */
export type LineKnobs = typeof DEFAULT_LINE_STYLE & { lines: number; pitch: number; tile: number }

export const DEFAULT_KNOBS: LineKnobs = { ...DEFAULT_LINE_STYLE, lines: 0, pitch: 1, tile: 1 }

export type LineSubject = 'a' | 'b' | 'c' | 'lantern'

