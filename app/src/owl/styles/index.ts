import { lazy, useLazy, type Lazy } from '../lazy'
import type { OwlStyle, OwlStyleMeta } from '../types'
import { style as blank } from './blank'

/**
 * The render styles, by id.
 *
 * A style is a directory here with two files: `styles/<name>/meta.ts` exports `meta`, its id
 * and label, and `styles/<name>/index.tsx` exports `style: OwlStyle`, its drawing. The
 * globs below find them, so registering one is adding that directory and editing nothing
 * else; in particular not `flat/`, and not this file. `knobs/design.ts` lists whatever is
 * registered as the options of the "Render style" knob.
 *
 * The two files are apart because they are needed at different times. The meta is loaded
 * with the page: the knob has to list every style, and a design has to be able to name one.
 * The drawing is a chunk of its own, fetched the first time a design asks for it, because
 * the owl as sent is the line-tile one, which is its own chunk.
 * Blank is the exception: it is the style an owl draws while another is on its way, and when
 * a design names one that is not registered, so it is always here and never fetched.
 *
 * What a style draws, and what it is not allowed to, is on `OwlStyle` in `../types.ts`.
 */

/** The style an owl falls back on when its design names one that is not registered. */
export const FALLBACK_STYLE = 'blank'

const metas = import.meta.glob<OwlStyleMeta>('./*/meta.ts', { eager: true, import: 'meta' })
// A glob takes literals only, so the fallback's directory is named here as well as above.
const drawings = import.meta.glob<{ style: OwlStyle }>(['./*/index.{ts,tsx}', '!./blank/*'])

/** `./lines/meta.ts` and `./lines/index.tsx` are both `lines`. */
const directory = (path: string) => path.split('/')[1]!

const loaders = new Map(Object.entries(drawings).map(([path, load]) => [directory(path), load]))

const STYLES = new Map<string, { meta: OwlStyleMeta; slot: Lazy<OwlStyle> }>(
  Object.entries(metas).map(([path, meta]) => {
    const load = loaders.get(directory(path))
    const slot = lazy(() => (load ? load().then((module) => module.style) : Promise.reject(new Error(`[owl] style "${meta.id}" has no index`))))
    if (meta.id === FALLBACK_STYLE) slot.provide(blank)
    return [meta.id, { meta, slot }]
  }),
)

// A directory with a drawing and no `meta.ts` is never registered, so say so where the
// person who added it is looking. (The other way round, a meta with no drawing, rejects
// when the style is asked for.) Dev only: a build has no such directory.
if (import.meta.env.DEV) {
  const described = new Set(Object.keys(metas).map(directory))
  for (const dir of loaders.keys()) {
    if (!described.has(dir)) console.warn(`[owl] styles/${dir}/ has a drawing but no meta.ts, so it is not registered`)
  }
}

/** Every registered style's id and label. Loads no drawing code. */
export function styleMetas(): OwlStyleMeta[] {
  return [...STYLES.values()].map((entry) => entry.meta)
}

/** For the knob that picks one. */
export function styleOptions(): { label: string; value: string }[] {
  return styleMetas().filter((meta) => meta.id !== FALLBACK_STYLE).map((meta) => ({ label: meta.label, value: meta.id }))
}

function warnUnregistered(id: string): void {
  if (import.meta.env.DEV) console.warn(`[owl] no render style "${id}"; drawing "${FALLBACK_STYLE}" instead`)
}

/**
 * The style to draw with now: the one asked for if its drawing is here, and flat if it is not
 * (not fetched yet, or not registered). Starts no fetch.
 */
export function getStyle(id: string): OwlStyle {
  const entry = STYLES.get(id)
  if (!entry) warnUnregistered(id)
  return entry?.slot.get() ?? blank
}

/** Fetch a style's drawing, or resolve to flat for an id that is not registered. */
export function loadStyle(id: string): Promise<OwlStyle> {
  const entry = STYLES.get(id)
  if (!entry) {
    warnUnregistered(id)
    return Promise.resolve(blank)
  }
  return entry.slot.load()
}

/**
 * `getStyle` for a component: flat until the style asked for has arrived, then that style.
 * The owl keeps its element and its box across the swap, so only what is drawn inside moves.
 */
export function useStyle(id: string): OwlStyle {
  const entry = STYLES.get(id)
  const loaded = useLazy(entry?.slot)
  if (!entry) warnUnregistered(id)
  return loaded ?? blank
}

/** For the code that has every drawing in hand (`all.ts`): nothing is fetched for a style given here. */
export function provideStyles(styles: readonly OwlStyle[]): void {
  for (const style of styles) STYLES.get(style.id)?.slot.provide(style)
}
