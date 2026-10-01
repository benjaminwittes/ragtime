import type { OwlTemperament } from '../types'

/**
 * The temperaments, by id.
 *
 * A temperament is a file here — `temperaments/<name>.ts` — whose default export is an
 * `OwlTemperament`: a named set of standing behaviours (`../standing/`) and how strongly
 * each runs, so that how an owl carries itself is data and can be picked by name. The glob
 * finds it; nothing else needs editing, and the "Temperament" knob lists it by itself. A
 * variant sets one with `temperament: '<id>'`, the panel's knob wins over it, and the
 * panel's per-behaviour knobs win over both (`../standing/core/resolve.ts`).
 *
 * `amount` and `period` multiply the behaviour's own defaults: an amount of 0.5 is half as
 * far, a period of 2 is twice as slow (or twice as long between gestures). The list is
 * written by feel, in the lab (`/owl-lab`, "Standing"), which shows each one on an owl.
 */

const modules = import.meta.glob<OwlTemperament>(['./*.ts', '!./index.ts', '!./*.test.ts'], {
  eager: true,
  import: 'default',
})

const ALL = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id))
const BY_ID = new Map(ALL.map((temperament) => [temperament.id, temperament]))

export function temperamentList(): readonly OwlTemperament[] {
  return ALL
}

export function temperamentMap(): ReadonlyMap<string, OwlTemperament> {
  return BY_ID
}

export function getTemperament(id: string): OwlTemperament | undefined {
  return BY_ID.get(id)
}

/** For the knob that picks one: the variant's, then none, then each. */
export function temperamentOptions(): { label: string; value: string }[] {
  return [
    { label: 'From the variant', value: 'inherit' },
    { label: 'None', value: 'none' },
    ...ALL.map((temperament) => ({ label: temperament.label, value: temperament.id })),
  ]
}
