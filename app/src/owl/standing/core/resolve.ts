import type { TuneValue } from '@/tune/types'
import type { OwlDesign, OwlTemperament, StandingConfig, StepMode } from '../../types'
import { STANDING_PREFIX } from './prefix'

/**
 * How the owl's standing behaviours are worked out, as a plain function of plain data, so
 * the rules can be tested in node (`../standing.test.ts`).
 *
 * Three layers say which behaviours run and how strongly, lowest to highest, the same
 * order the rest of the design uses:
 *
 *   1. the temperament: a variant names one (`design.temperament`), and every behaviour it
 *      lists is on, at its `amount` and `period`, which are multiples of the behaviour's own;
 *   2. the variant's own `standing` record, which can switch one on that the temperament
 *      does not list, or off that it does;
 *   3. a tuned knob: the panel's temperament, the master switch, and each behaviour's
 *      switch (`inherit`, `on`, `off`), amount and period.
 *
 * The result is written back into the design — `standing` is the behaviours that are on,
 * and `params.standing` carries each one's amount and period — so everything
 * that reads a design, the scaffold's `data-standing` included, reads one place. A design
 * with nothing on comes back as the same object, which is how the owl as sent stays
 * exactly what it was.
 */

/**
 * What resolving needs to know of the behaviours is which exist, and that is all: the ids are
 * the file names, known without loading a behaviour. A period is therefore kept as a multiple
 * of the behaviour's own (`1` is its default) and turned into seconds where the behaviour is
 * in hand (`standingConfigs`), so choosing what runs never waits on code that runs it.
 */
export type StandingRegistry = {
  ids: ReadonlySet<string>
  temperaments: ReadonlyMap<string, OwlTemperament>
}

const DEFAULT_FPS = 10

function number(value: TuneValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function applyStanding(
  design: OwlDesign,
  tuned: Readonly<Record<string, TuneValue>>,
  registry: StandingRegistry,
): OwlDesign {
  const quiet = (): OwlDesign =>
    Object.keys(design.standing).length === 0 ? design : { ...design, standing: {} }
  if (tuned[STANDING_PREFIX + 'master'] === false) return quiet()

  const picked = tuned[STANDING_PREFIX + 'temperament']
  const temperamentId =
    typeof picked === 'string' && picked !== 'inherit' ? (picked === 'none' ? null : picked) : design.temperament
  const temperament = temperamentId ? registry.temperaments.get(temperamentId) : undefined

  const on = new Map<string, { amount: number; period: number }>()
  for (const [id, entry] of Object.entries(temperament?.behaviours ?? {})) {
    on.set(id, { amount: entry.amount ?? 1, period: entry.period ?? 1 })
  }
  for (const [id, state] of Object.entries(design.standing)) {
    if (!state) on.delete(id)
    else if (!on.has(id)) on.set(id, { amount: 1, period: 1 })
  }
  for (const id of registry.ids) {
    const switchTo = tuned[`${STANDING_PREFIX}${id}.on`]
    if (switchTo === 'off') on.delete(id)
    else if (switchTo === 'on' && !on.has(id)) on.set(id, { amount: 1, period: 1 })
  }

  const standing: Record<string, boolean> = {}
  const params: Record<string, TuneValue> = {}
  for (const [id, scale] of [...on].sort(([a], [b]) => a.localeCompare(b))) {
    if (!registry.ids.has(id)) continue
    standing[id] = true
    params[`${id}.amount`] = scale.amount * number(tuned[`${STANDING_PREFIX}${id}.amount`], 1)
    params[`${id}.period`] = scale.period * number(tuned[`${STANDING_PREFIX}${id}.period`], 1)
  }
  if (Object.keys(standing).length === 0) return quiet()

  const step = tuned[STANDING_PREFIX + 'step']
  params.step = step === 'always' || step === 'never' || step === 'auto' ? step : (temperament?.step ?? 'auto')
  params.fps = number(tuned[STANDING_PREFIX + 'fps'], DEFAULT_FPS)
  params.seed = number(tuned[STANDING_PREFIX + 'seed'], 0)
  return { ...design, standing, params: { ...design.params, standing: params } }
}

/**
 * The settings each running behaviour is handed, from what `applyStanding` wrote.
 * `ownPeriod` is a behaviour's period at its defaults, in seconds, which the multiple
 * `applyStanding` wrote scales. `scanning` is whether the owl is under the scan finish, which is the one case where
 * `step: auto` steps.
 */
export function standingConfigs(
  design: OwlDesign,
  scanning: boolean,
  ownPeriod: (id: string) => number,
): Record<string, StandingConfig> {
  const raw = design.params.standing ?? {}
  const mode = (raw.step as StepMode | undefined) ?? 'auto'
  const fps = mode === 'always' || (mode === 'auto' && scanning) ? number(raw.fps, DEFAULT_FPS) : 0
  const out: Record<string, StandingConfig> = {}
  for (const id of Object.keys(design.standing)) {
    if (!design.standing[id]) continue
    out[id] = {
      amount: number(raw[`${id}.amount`], 1),
      period: ownPeriod(id) * number(raw[`${id}.period`], 1),
      fps,
    }
  }
  return out
}

/** The seed the panel set, which a behaviour's own draws are mixed with. */
export function standingSeed(design: OwlDesign): number {
  return number(design.params.standing?.seed, 0)
}
