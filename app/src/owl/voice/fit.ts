import type { SpeechPlace } from './types'

/**
 * Where a line of speech goes so that it stays on the screen, as geometry in and geometry
 * out — no DOM — so it can be tested in node (`fit.test.ts`). `OwlSpeech` measures the owl's
 * box, the note and the viewport, asks, and writes the answer back as custom properties.
 *
 * Speech is absolutely positioned against the owl's box, so none of this moves anything
 * else on the page; what it settles is only whether the note itself is cut off by the edge
 * of the screen, and on which side of the owl it sits.
 */

export type Box = { left: number; top: number; right: number; bottom: number }
export type Size = { width: number; height: number }

export type Fit = {
  /** The side to use, which is the one asked for unless it had no room. */
  place: SpeechPlace
  /** The widest the note may be, in px, or null for no limit beyond its own CSS. */
  maxWidth: number | null
  /** A horizontal nudge, in px, for a note centred on the owl that would cross the edge. */
  shift: number
}

/** Below this, a note beside the owl is a column of single words, and another side is better. */
export const MIN_BESIDE = 120

export function fitNote(args: {
  place: SpeechPlace
  anchor: Box
  note: Size
  viewport: Size
  /** The space kept between the owl and the note. */
  gap: number
  /** The space kept between the note and the edge of the screen. */
  margin: number
}): Fit {
  const { anchor, note, viewport, gap, margin } = args
  const place = args.place
  if (place === 'inline') return { place, maxWidth: null, shift: 0 }

  if (place === 'beside' || place === 'beside-start') {
    const right = viewport.width - anchor.right - gap - margin
    const left = anchor.left - gap - margin
    const want = place === 'beside' ? right : left
    const other = place === 'beside' ? left : right
    const wantPlace: SpeechPlace = place
    const otherPlace: SpeechPlace = place === 'beside' ? 'beside-start' : 'beside'
    // The side asked for, when it holds the note or at least a readable column of it.
    if (want >= Math.min(note.width, MIN_BESIDE)) return { place: wantPlace, maxWidth: Math.max(0, want), shift: 0 }
    if (other >= Math.min(note.width, MIN_BESIDE)) return { place: otherPlace, maxWidth: Math.max(0, other), shift: 0 }
    return below(anchor, note, viewport, margin)
  }

  // Above or below, centred on the owl. Flip when the near side is off the screen and the other is not.
  const room = (side: 'above' | 'below') =>
    side === 'above' ? anchor.top - gap - note.height - margin : viewport.height - anchor.bottom - gap - note.height - margin
  const flipped: SpeechPlace = place === 'above' ? 'below' : 'above'
  const chosen = room(place) < 0 && room(flipped) >= 0 ? flipped : place
  return centred(chosen, anchor, note, viewport, margin)
}

function below(anchor: Box, note: Size, viewport: Size, margin: number): Fit {
  return centred('below', anchor, note, viewport, margin)
}

function centred(place: SpeechPlace, anchor: Box, note: Size, viewport: Size, margin: number): Fit {
  const maxWidth = Math.max(0, viewport.width - 2 * margin)
  const width = Math.min(note.width, maxWidth)
  const left = (anchor.left + anchor.right) / 2 - width / 2
  const right = left + width
  let shift = 0
  if (left < margin) shift = margin - left
  else if (right > viewport.width - margin) shift = viewport.width - margin - right
  return { place, maxWidth, shift }
}
