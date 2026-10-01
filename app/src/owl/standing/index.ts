import { useEffect, type RefObject } from 'react'
import type { OwlDesign, OwlStanding } from '../types'

/**
 * Standing behaviours: what the owl does when nobody is asking anything of it — breathing,
 * a shifted weight, a glance at nothing. None exist yet; this is where they go.
 *
 * To add one:
 *
 *   1. Add `standing/<id>.ts` whose default export is an `OwlStanding` (`../types.ts`).
 *      The glob below registers it; nothing else is edited.
 *   2. Switch it on where it should be on, in data: `standing: { <id>: true }` in a
 *      variant's patch (`../variants/`), or a boolean knob `owl.design.standing.<id>`
 *      in a knob file of its own (`../knobs/`) to try it live.
 *   3. If it is only CSS, that is all: the owl's root carries `data-standing="<id> …"`
 *      for each one that is on, so a stylesheet keyed on `.owl[data-standing~='<id>']`
 *      is the behaviour. Import that stylesheet from the behaviour's own file. If it needs
 *      a timer or a listener, give it a `start` and return its cleanup.
 *
 * Two rules from the rest of the owl apply. A behaviour never moves a pixel outside the
 * figure's own box, and it stops for a reader who has asked for reduced motion — `start`
 * is not called for them, and a CSS behaviour has to sit inside
 * `@media (prefers-reduced-motion: no-preference)` itself.
 *
 * Renderers do not know any of this exists, which is the point: a standing behaviour
 * moves the groups the scaffold already draws, so it works in every style.
 */

const modules = import.meta.glob<OwlStanding>(['./*.ts', '!./index.ts', '!./*.test.ts'], {
  eager: true,
  import: 'default',
})

const STANDING = new Map<string, OwlStanding>(
  Object.values(modules).map((behaviour) => [behaviour.id, behaviour]),
)

export function standingList(): OwlStanding[] {
  return [...STANDING.values()]
}

/** The ids a design has switched on, in a stable order. */
export function enabledStanding(standing: OwlDesign['standing']): string[] {
  return Object.keys(standing)
    .filter((id) => standing[id])
    .sort()
}

/**
 * Run the `start` of every standing behaviour the design has on, for as long as the
 * owl is mounted and the set does not change. Nothing runs for a reader who has asked
 * for reduced motion.
 */
export function useStanding(svg: RefObject<SVGSVGElement | null>, design: OwlDesign): void {
  const key = enabledStanding(design.standing).join(' ')
  useEffect(() => {
    const el = svg.current
    if (!el || key === '') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const stops: (() => void)[] = []
    for (const id of key.split(' ')) {
      const stop = STANDING.get(id)?.start?.({ svg: el, design })
      if (stop) stops.push(stop)
    }
    return () => {
      for (const stop of stops) stop()
    }
    // `design` is deliberately not a dependency: a behaviour that wants to follow a
    // tuned value reads it from the custom properties on the root, which are live.
    // Restarting every timer on each knob drag would be the behaviour changing under
    // the hand that is moving the knob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, key])
}
