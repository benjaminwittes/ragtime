import type { OwlStyle } from '../types'

/**
 * The render styles, by id.
 *
 * A style is a directory here — `styles/<name>/index.tsx` — that exports `style: OwlStyle`.
 * The glob below finds it, so registering one is adding that directory and editing
 * nothing else; in particular not `flat/`, and not this file. `knobs/design.ts` lists
 * whatever is registered as the options of the "Render style" knob.
 *
 * What a style draws, and what it is not allowed to, is on `OwlStyle` in `../types.ts`.
 */

const modules = import.meta.glob<{ style: OwlStyle }>('./*/index.{ts,tsx}', { eager: true })

const STYLES = new Map<string, OwlStyle>(
  Object.values(modules).map((module) => [module.style.id, module.style]),
)

/** The style an owl falls back on when its design names one that is not registered. */
export const FALLBACK_STYLE = 'flat'

export function getStyle(id: string): OwlStyle {
  const style = STYLES.get(id) ?? STYLES.get(FALLBACK_STYLE)
  if (!style) throw new Error(`[owl] no render style "${id}", and no "${FALLBACK_STYLE}" to fall back on`)
  if (import.meta.env.DEV && style.id !== id) {
    console.warn(`[owl] no render style "${id}"; drawing "${style.id}" instead`)
  }
  return style
}

export function styleList(): OwlStyle[] {
  return [...STYLES.values()]
}

/** For the knob that picks one. */
export function styleOptions(): { label: string; value: string }[] {
  return styleList().map((style) => ({ label: style.label, value: style.id }))
}
