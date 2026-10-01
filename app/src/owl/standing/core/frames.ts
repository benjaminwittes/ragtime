/**
 * Keyframe helpers for standing behaviours: pure functions from numbers to keyframes.
 */

type Props = Record<string, string | number>

/**
 * One cycle of a periodic motion, sampled: `at(t)` is called for `t` from 0 to 1 and gives
 * the properties at that point, and the keyframes joining the samples are linear. Sampling
 * is what lets a motion be a real sine (which two keyframes and an easing curve are not: an
 * eased pair stops at both ends, and a swing does not stop where it passes the middle).
 * The last sample is the first, so the loop has no seam.
 */
export function cycle(at: (t: number) => Props, samples = 16): Keyframe[] {
  const out: Keyframe[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    out.push({ offset: t, ...at(i === samples ? 0 : t) })
  }
  return out
}

/**
 * A gesture as beats in time: each is `[at, properties, easing?]`, `at` in milliseconds from
 * the start, and the easing shapes the move *into* the next beat. Returns the keyframes and
 * the duration (the last beat), so a gesture is written in the units a person thinks in.
 */
export function track(beats: readonly (readonly [at: number, props: Props, ease?: string])[]): {
  frames: Keyframe[]
  duration: number
} {
  const duration = beats[beats.length - 1][0]
  const frames = beats.map(([at, props, ease]) => ({
    offset: at / duration,
    ...props,
    ...(ease ? { easing: ease } : {}),
  }))
  return { frames, duration }
}

/** The easings gestures use: out is a quick start that settles, in-out is a slow start and end. */
export const EASE = {
  out: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
  inOut: 'cubic-bezier(0.45, 0, 0.3, 1)',
  step: 'steps(1, jump-end)',
} as const

/** 0 at the ends of the cycle, 1 in the middle, as a cosine: the shape of one breath. */
export function swell(t: number): number {
  return (1 - Math.cos(t * Math.PI * 2)) / 2
}

/** A rounded number for a CSS value. */
export function n(value: number, places = 3): string {
  return String(Number(value.toFixed(places)))
}

/**
 * Looped motion that is stepped: each segment between two keyframes is held in `fps` equal
 * jumps a second, so the owl moves like an animation shot on twos and not like a vector.
 * `fps` of 0 leaves the keyframes as they are. `period` is the cycle's length in seconds.
 */
export function stepify(frames: Keyframe[], period: number, fps: number): Keyframe[] {
  if (!(fps > 0)) return frames
  return frames.map((frame, i) => {
    const next = frames[i + 1]
    if (!next) return frame
    const from = Number(frame.offset ?? i / (frames.length - 1))
    const to = Number(next.offset ?? (i + 1) / (frames.length - 1))
    return { ...frame, easing: `steps(${Math.max(1, Math.round((to - from) * period * fps))})` }
  })
}
