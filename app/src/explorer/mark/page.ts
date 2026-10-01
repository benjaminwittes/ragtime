import { MARK_FALLBACK } from './config.ts'
import { parseColor, type RGB } from './glyph.ts'

/** The mark's colour on this page: `--x-mark` when the page sets one, else the fallback. */
export function markColor(el: Element): RGB {
  const set = getComputedStyle(el).getPropertyValue('--x-mark')
  return parseColor(set) ?? parseColor(MARK_FALLBACK)!
}

/** The page's ink where `el` sits: its computed text colour. */
export function inkColor(el: Element): RGB {
  return parseColor(getComputedStyle(el).color) ?? [0, 0, 0]
}

/** True when the reader has asked the system for less motion; the mark then stays at rest. */
export const prefersStill = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
