export type Print = {
  /** The page re-seats on the glass, and the hatching goes out of register with it. */
  boil: boolean
  /** The hatching thickens and thins as a whole. */
  breath: boolean
  /** The ink and the flame flicker. */
  flicker: boolean
  /** A band of light crosses, stepping. */
  bar: boolean
  /** How strongly all of it moves; 1 is the owl's own Print temperament. */
  amount: number
  /** How much of that the page's shifting takes: the horizontal and vertical jitter, as a multiple of `amount`. */
  jitter: number
  /** Steps a second of the drawing itself (blink, breath, tilt). */
  fps: number
  /** Seconds between light-bar passes. */
  barEvery: number
}

export const PRINT_ON: Print = { boil: true, breath: true, flicker: true, bar: false, amount: 0.8, jitter: 1, fps: 16, barEvery: 23 }
export const PRINT_OFF: Print = { ...PRINT_ON, boil: false, breath: false, flicker: false, bar: false }

