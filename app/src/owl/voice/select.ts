import type { OccasionId, OwlVoice } from './types'

/**
 * Which line a voice says, as a plain function of plain data: no registry, no store, no
 * React, no clock, no random source, so the rules can be tested in node (`select.test.ts`).
 *
 * The rules:
 *
 *   - A voice speaks only its own lines. One with no line for an occasion is silent on it;
 *     there is no fallback to another voice, nor to another occasion.
 *   - No immediate repeat: the line just said is never chosen again while another exists.
 *   - Lines said recently are put off until the rest have had their turn.
 *   - An occasion with a single line, said a moment ago, is silent rather than repeating.
 */

/** How many of the lines said last, per voice and occasion, are kept out of the running. */
export const RECENT = 3

/** The lines a voice has for an occasion; empty when it has none. */
export function linesFor(voice: OwlVoice | undefined, occasion: OccasionId): readonly string[] {
  return voice?.lines[occasion] ?? []
}

/**
 * The line to say, or null for silence.
 *
 * `recent` is what this voice last said on this occasion, oldest first. `roll` is a number
 * in [0, 1) from whatever random source the caller has; handed in, so that the choice is
 * repeatable.
 */
export function pickLine(
  voice: OwlVoice | undefined,
  occasion: OccasionId,
  recent: readonly string[],
  roll: number,
): string | null {
  const all = linesFor(voice, occasion).filter((line) => line.trim() !== '')
  if (all.length === 0) return null
  const last = recent[recent.length - 1]
  const fresh = all.filter((line) => !recent.includes(line))
  const pool = fresh.length > 0 ? fresh : all.filter((line) => line !== last)
  if (pool.length === 0) return null
  const at = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))
  return pool[at] ?? null
}

/** `recent` after `line` has been said: the newest `RECENT`, with no repeat of the same line in it. */
export function remember(recent: readonly string[], line: string): string[] {
  return [...recent.filter((seen) => seen !== line), line].slice(-RECENT)
}
