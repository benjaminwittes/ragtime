import { SAMPLES, type SampleSet } from '@/hub/samples'

/**
 * What the Explorer's empty state says while nothing has been asked: one corpus
 * at a time, as the hub's title does.
 *
 * The UI/UX live document asked for the Explorer's landing to be dynamic "like
 * the landing page" instead of the one fixed "Ask the federal record a
 * question." The hub already holds what that takes. Each of its sample sets
 * carries an Explorer sentence written for its corpus (`titles.explorer`) and
 * three questions checked against what that corpus holds (`samples[].question`),
 * so the Explorer reads them rather than keeping a second register to drift.
 *
 * Beat 0 is the whole federal record, whose sentence is the old fixed heading
 * word for word, so the hub's `surface-intro` morph still lands on the same
 * sentence it left. That beat offers no question of its own: its three are the
 * Explorer's examples, already on the screen below it.
 */
export type LandingBeat = {
  heading: string
  /** The corpus this beat speaks for, or `'all'`. */
  slug: SampleSet['slug']
  /** A question to offer on this beat, or null where the examples already say it. */
  question: string | null
}

/** One beat per set, in the hub's order, so the two rotations walk the same path. */
export const LANDING_BEATS = SAMPLES.length

/**
 * The beat at `n`. `n` counts up forever; each pass round the sets takes the next
 * of a set's three questions, so a reader who stays sees each set ask something new.
 */
export function landingBeat(n: number): LandingBeat {
  const i = ((n % LANDING_BEATS) + LANDING_BEATS) % LANDING_BEATS
  const set = SAMPLES[i]!
  const round = Math.floor(Math.max(0, n) / LANDING_BEATS)
  return {
    heading: set.titles.explorer,
    slug: set.slug,
    question: set.slug === 'all' ? null : set.samples[round % set.samples.length]!.question,
  }
}

/** How long each beat stands, in milliseconds: long enough to read the question under it. */
export const LANDING_DWELL_MS = 6000
