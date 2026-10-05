import { useMemo, useSyncExternalStore } from 'react'
import { subscribeTune, tuneOverrides, tuneValue, tuneVersion } from '@/tune/store'
import { baseDesign } from './design'
import { mergeDesign, pickVariantId, resolveDesign } from './resolve'
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

/** The base, the variant, whatever is tuned, and a pin. */
function layered(variant: string, pin?: OwlPin): OwlDesign {
  const resolved = resolveDesign(baseDesign(), [getVariant(variant)?.design], tuneOverrides())
  return pin ? mergeDesign(resolved, pin.design) : resolved
}

/** The design for a variant id, with whatever is tuned right now laid over it. */
export function designFor(variant: string, pin?: OwlPin): OwlDesign {
  return layered(variant, pin)
}

/**
 * The design one owl draws with. `variant` is the one the caller asked for, if any; without it
 * the owl wears the active variant (`owl.variant`). An id that is not registered, as a stale
 * preset can name, falls back to the base.
 */
export function useOwlDesign(variant?: string, pin?: OwlPin): OwlDesign {
  const version = useTuneVersion()
  return useMemo(() => {
    const global = tuneValue('owl.variant')
    const id = pickVariantId(variant, typeof global === 'string' ? global : undefined)
    return layered(getVariant(id) ? id : 'base', pin)
    // `version` is the dependency that matters: the global variant and every tuned value
    // are read through the store, which this hook subscribes to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, variant, pin])
}
