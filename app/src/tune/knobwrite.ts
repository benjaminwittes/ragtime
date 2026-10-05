import { isTuned, resetTuneValue, setTuneValue } from './store'
import type { TuneValue } from './types'

/** How a row writes: the tuner's overrides, or (for the reader's panel) the reader's own store. */
export type KnobWrite = {
  set: (id: string, value: TuneValue) => void
  reset: (id: string) => void
  /** Has this been moved from its default, by whoever this row writes for? */
  changed: (id: string) => boolean
}

export const TUNER: KnobWrite = { set: setTuneValue, reset: resetTuneValue, changed: isTuned }
