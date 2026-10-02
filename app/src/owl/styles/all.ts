import type { OwlStyle } from '../types'
import { provideStyles } from './index'

/**
 * Every style's drawing, loaded together, for what looks at all of them: the lab and the
 * tests. Nothing the app's pages import reaches this file, so a build without the tuning
 * layer has no use for it and fetches no style it was not asked for.
 *
 * Importing it hands each drawing to the registry, so `getStyle` returns it at once.
 */

const modules = import.meta.glob<{ style: OwlStyle }>('./*/index.{ts,tsx}', { eager: true })

const STYLES: readonly OwlStyle[] = Object.values(modules).map((module) => module.style)

provideStyles(STYLES)

export function styleList(): readonly OwlStyle[] {
  return STYLES
}
