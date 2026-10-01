/**
 * A small seeded generator, so that anything an owl does by chance can be replayed: the
 * same seed and the same behaviour give the same gaps between gestures and the same
 * jitter, and a test can say what they are.
 */

/** A 32-bit hash of a string and a number: a stable way to turn "this owl, this behaviour" into a seed. */
export function hashSeed(text: string, n = 0): number {
  let h = (2166136261 ^ n) >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  // A final mix so that seeds that differ by one are not neighbours.
  h ^= h >>> 15
  h = Math.imul(h, 2246822519) >>> 0
  h ^= h >>> 13
  return h >>> 0
}

/** mulberry32: a number in [0, 1) each call. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The first number of a stream: one value that is fixed by the seed and the name. */
export function unit(text: string, seed: number): number {
  return seeded(hashSeed(text, seed))()
}

/**
 * The gap before the next occasional gesture, in seconds: the mean, scaled by a draw from
 * `[1 - spread, 1 + spread]`. A spread of 0.5 means "between half as long and half again
 * as long", which is irregular enough not to be counted and regular enough to be seen.
 */
export function gap(mean: number, spread: number, draw: number): number {
  return mean * (1 - spread + 2 * spread * draw)
}
