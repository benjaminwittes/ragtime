/**
 * The mark's behaviour, as ratified on the prototype (2026-09-30). Sizes are CSS px.
 * Nothing here is a setting: the design is closed, and these are the numbers it closed on.
 */
export const MARK = {
  lines: 5,
  width: 16,
  gap: 2.6,
  weight: 1,
  /** Space between the last letter and the glyph. */
  before: 4,
  /** How far the glyph sits above the baseline. */
  lift: 4,
  /** Length of the five faded lines that trail behind the glyph while it paints. */
  trail: 76,
  ghostStrength: 0.55,
  /** Seconds to draw in on arrival. */
  drawTime: 0.8,
  breatheAmp: 0.7,
  finishAmp: 1.3,
  /**
   * The slowest the brush ever moves, px/s. It is a floor, not the speed: the brush writes
   * what has arrived, and what has arrived sets its pace (`catchUp`). The floor is what
   * carries it over the last few letters, where "a share of what is left" is nearly nothing.
   */
  speed: 1400,
  /**
   * How long the brush takes to close on the end of what has arrived, in seconds: each
   * moment it covers the share of the distance that closes all of it in about this long.
   * So it writes at the pace the answer streams, and when a paragraph lands at once it is
   * across it in a blink instead of walking it at one speed for half a minute.
   */
  catchUp: 0.16,
  /** A letter fades in over this many px behind the front. */
  edge: 44,
  /** …and then settles from the mark's colour to the page's ink over this many px. */
  solid: 110,
  /** The mark leads the text by this many px. */
  lead: 27,
} as const

/** Used when the page does not define `--x-mark`. Sampled by eye from the Lawfare banner; not the brand value. */
export const MARK_FALLBACK = '#2b6872'
