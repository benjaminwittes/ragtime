/**
 * The tuning registry — every knob the panel can draw, and every surface that
 * owns some.
 *
 * Declaration is by side effect on import, the same shape `src/docs/registry.ts`
 * uses: a surface writes one `tune.ts` next to its own code and calls
 * `defineSurface` + `defineTunables` at module scope. Page code that reads a
 * runtime knob imports that module anyway (for `useTunable`), so the
 * declaration is loaded whenever the page is; the panel additionally imports
 * `./knobs.ts`, which pulls in every surface's module so knobs for a page you
 * are not currently looking at are still listed, greyed, and reachable.
 *
 * Nothing here is dev-only. The declarations carry the *defaults* the app runs
 * on in production, so they must ship: `useTunable('hub.previewRows')` returns
 * 25 in a production build because that is what the declaration says, with no
 * panel, no store and no overlay anywhere near it.
 */

import type { Tunable, TuneSurface } from './types'

const surfaces = new Map<string, TuneSurface>()
const tunables = new Map<string, Tunable>()

/** Register a page (or page-shaped region) that owns knobs. Idempotent. */
export function defineSurface(surface: TuneSurface): TuneSurface {
  surfaces.set(surface.id, surface)
  return surface
}

/**
 * Register knobs. Returns the list, so a module can both declare and export in
 * one statement. A duplicate id is a programming error and throws loudly in
 * dev — two knobs sharing an id would silently overwrite each other in presets.
 */
export function defineTunables<T extends readonly Tunable[]>(list: T): T {
  for (const knob of list) {
    if (import.meta.env.DEV && tunables.has(knob.id)) {
      throw new Error(`[tune] duplicate tunable id: ${knob.id}`)
    }
    tunables.set(knob.id, knob)
  }
  return list
}

export function getTunable(id: string): Tunable | undefined {
  return tunables.get(id)
}

export function allTunables(): Tunable[] {
  return [...tunables.values()]
}

export function getSurface(id: string): TuneSurface | undefined {
  return surfaces.get(id)
}

export function allSurfaces(): TuneSurface[] {
  return [...surfaces.values()]
}

/**
 * The CSS selector a knob's custom property is written under at runtime.
 *
 * Global knobs land on `:root`; a surface's land on the surface's own selector,
 * so the Explorer's measure cannot reach the hub. Both are doubled
 * (`:root:root`, `.explorer.explorer`) — same elements matched, one more point
 * of specificity, which is what keeps the overlay winning over the stylesheet
 * it is overriding no matter what order Vite injects styles in.
 */
export function overlaySelector(knob: Tunable): string {
  if (knob.scope === 'global') return ':root:root'
  const surface = surfaces.get(knob.scope)
  if (!surface) return ':root:root'
  return surface.selector + surface.selector
}

/** Is this surface on screen right now? The panel's whole notion of "this page". */
export function surfaceIsMounted(surface: TuneSurface): boolean {
  try {
    return document.querySelector(surface.selector) !== null
  } catch {
    return false
  }
}
