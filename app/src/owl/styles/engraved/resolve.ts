import { allTunables } from '@/tune/registry'
import { tuneOverrides } from '@/tune/store'
import type { TuneValue } from '@/tune/types'
import type { OwlDesign } from '../../types'
import { engravedParams, scanParams, type EngravedParams, type ScanParams } from './params'

/**
 * The engraved style's settings for one owl, from three layers in the order the rest of
 * the owl uses: the knobs' declared defaults, the variant's `params.engraved`, and
 * whatever is being tuned right now.
 *
 * The defaults are read from the registry on first use and not at import. The knob file
 * imports the style list for its "Render style" options, so importing it from here would
 * be a cycle; by the time an owl renders, every knob has registered.
 */

const PREFIX = 'owl.engraved.'

let defaults: Record<string, TuneValue> | undefined

function declared(): Record<string, TuneValue> {
  if (!defaults) {
    defaults = {}
    for (const knob of allTunables()) {
      if (knob.id.startsWith(PREFIX)) defaults[knob.id.slice(PREFIX.length)] = knob.value
    }
  }
  return defaults
}

export type EngravedSettings = { params: EngravedParams; scan: ScanParams }

/** `tuned` is the live overrides by knob id; tests pass their own. */
export function resolveEngraved(
  design: Pick<OwlDesign, 'params'>,
  tuned: Readonly<Record<string, TuneValue>> = tuneOverrides(),
): EngravedSettings {
  const raw: Record<string, TuneValue> = { ...declared(), ...design.params.engraved }
  for (const [id, value] of Object.entries(tuned)) {
    if (id.startsWith(PREFIX)) raw[id.slice(PREFIX.length)] = value
  }
  return { params: engravedParams(raw), scan: scanParams(raw) }
}
