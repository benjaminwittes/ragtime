export type Print = {
  /** The page re-seats on the glass, and the hatching goes out of register with it. */
  boil: boolean
  /** The hatching thickens and thins as a whole. */
  breath: boolean
  /** The ink and the flame flicker. */
  flicker: boolean
  /** A band of light crosses, stepping. */
  bar: boolean
  /** The photocopied finish: ink spread, a hard clip, edge wobble, toner. */
  scan: boolean
  /** How strongly all of it moves; 1 is the owl's own Print temperament. */
  amount: number
  /** Steps a second of the drawing itself (blink, breath, tilt). */
  fps: number
  /** Seconds between light-bar passes. */
  barEvery: number
}

export const PRINT_ON: Print = { boil: true, breath: true, flicker: true, bar: true, scan: true, amount: 0.8, fps: 16, barEvery: 23 }
export const PRINT_OFF: Print = { ...PRINT_ON, boil: false, breath: false, flicker: false, bar: false, scan: false }
