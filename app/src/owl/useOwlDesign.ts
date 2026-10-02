import { useMemo, useSyncExternalStore } from 'react'
import { subscribeTune, tuneOverrides, tuneValue, tuneVersion } from '@/tune/store'
import { baseDesign } from './design'
import { mergeDesign, pickVariantId, resolveDesign } from './resolve'
import { resolveStanding, useStandingKit, wantsStanding } from './standing'
import type { TuneValue } from '@/tune/types'
import type { OwlDesign, OwlPin } from './types'
import { getVariant } from './variants'

/**
 * Where the pure rules (`resolve.ts`) meet the live registries and the live tuned values.
 *
 * In a production build nothing is ever tuned, so `tuneVersion()` stays at 0, the store
 * fires nothing, and every owl resolves its design once, from the declared defaults.
 * With the panel open, a moved knob bumps the version and every owl on the page resolves
 * again.
 */

/** A number that changes when any tuned value does; read it to re-render on a change. */
export function useTuneVersion(): number {
  return useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
}

/**
 * The design for a variant id, before its standing behaviours are worked out: the base, the
 * variant, whatever is tuned, and a pin. `knobs` is what the standing rules read.
 */
function layered(variant: string, pin?: OwlPin): { design: OwlDesign; knobs: Readonly<Record<string, TuneValue>> } {
  const tuned = tuneOverrides()
  const resolved = resolveDesign(baseDesign(), [getVariant(variant)?.design], tuned)
  return { design: pin ? mergeDesign(resolved, pin.design) : resolved, knobs: pin ? (pin.knobs ?? {}) : tuned }
}

/**
 * The design for a variant id, with whatever is tuned right now laid over it.
 *
 * `pin` is a patch laid over all of that with standing knobs of its own, and a pinned design
 * ignores the panel's standing knobs, so that a specimen — a lab row that is meant to show
 * one temperament — stays what it says while the panel moves every other owl on the page.
 */
export function designFor(variant: string, pin?: OwlPin): OwlDesign {
  const { design, knobs } = layered(variant, pin)
  return resolveStanding(design, knobs)
}

/**
 * The design one owl draws with. `variant` is the one the caller asked for, if any;
 * without it the owl wears the active variant (`owl.variant`). An id that is not
 * registered — a stale preset can name one that has since gone — falls back to the base.
 *
 * A design that asks for standing behaviours needs the rules that work them out, which are a
 * chunk of their own: it has them off until they arrive, and then the design changes once.
 */
export function useOwlDesign(variant?: string, pin?: OwlPin): OwlDesign {
  const version = useTuneVersion()
  const layers = useMemo(() => {
    const global = tuneValue('owl.variant')
    const id = pickVariantId(variant, typeof global === 'string' ? global : undefined)
    return layered(getVariant(id) ? id : 'base', pin)
    // `version` is the dependency that matters: the global variant and every tuned value
    // are read through the store, which this hook subscribes to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, variant, pin])
  const kit = useStandingKit(wantsStanding(layers.design, layers.knobs))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `kit` is not read, it is what says the standing code arrived
  return useMemo(() => resolveStanding(layers.design, layers.knobs), [layers, kit])
}
