import { allTunables } from '@/tune/registry'
import type { TuneValue } from '@/tune/types'
import './knobs'
import { DESIGN_PREFIX, designFromDefaults } from './resolve'
import type { OwlDesign } from './types'

/**
 * The owl's base design. Its scalars (the render style, the ink, the night hours) are declared
 * once, as knobs, in `knobs/`; the `value:` of each declaration is the default, and this reads
 * it back out of the tuning registry rather than keeping a second copy. A knob id names its
 * place in the design: `owl.design.palette.navy` is `design.palette.navy`. What a knob cannot
 * express is the voice, which is plain data here.
 *
 * A variant (`variants/`) is a patch over the result, and a tuned knob goes over that
 * (`resolve.ts`).
 */

const STRUCTURE: Partial<OwlDesign> = {
  voice: 'ragtime',
}

let base: OwlDesign | undefined

/** The knobs' declared defaults, by id: what the app runs on before anyone tunes anything. */
function declaredDefaults(): Record<string, TuneValue> {
  const out: Record<string, TuneValue> = {}
  for (const knob of allTunables()) {
    if (knob.id.startsWith(DESIGN_PREFIX)) out[knob.id] = knob.value
  }
  return out
}

/** The base design. Built on first use, so every knob file has registered by then. */
export function baseDesign(): OwlDesign {
  base ??= designFromDefaults(STRUCTURE, declaredDefaults())
  return base
}
