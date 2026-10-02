import { useEffect, type RefObject } from 'react'
import { lazy, useLazy } from '../lazy'
import type { OwlDesign } from '../types'
import { STANDING_PREFIX } from './core/prefix'
import type { TuneValue } from '@/tune/types'

/**
 * Standing behaviours: what the owl does when nobody is asking anything of it — breathing,
 * a shifted weight, a glance at nothing — and the print behaviours that belong to the
 * engraved, scanned look.
 *
 * To add one:
 *
 *   1. Add `standing/<id>.ts` whose default export is an `OwlStanding` (`../types.ts`) and
 *      whose `id` is the file's name. The glob in `core/kit.ts` registers it; nothing else is edited.
 *      `start` builds the motion from the context's `loop` (a cycle) and `gesture` (one
 *      movement) and `every` (an irregular schedule): see `core/host.ts` for why those
 *      stack instead of fighting.
 *   2. Give it knobs in `../knobs/deferred/standing.ts` (a switch, an amount and a period),
 *      which is what the Tune panel shows, and list it in a temperament (`../temperaments/`)
 *      to make it part of a character.
 *   3. If it needs a static rule — a transform box for an element it scales — add a
 *      stylesheet keyed on `.owl[data-standing~='<id>']` and import it from the behaviour.
 *
 * Two rules from the rest of the owl apply. A behaviour never moves a pixel outside the
 * figure's own box, and it stops for a reader who has asked for reduced motion: `start`
 * is not called for them, and is stopped if they ask while it runs.
 *
 * Renderers do not know any of this exists, which is the point: a behaviour moves the
 * parts the scaffold groups (`../parts.ts`), so it works in every style.
 *
 * **What is loaded when.** The owl as sent has nothing standing, so none of the code that
 * stands is in the page that carries it. This file is the part that is: it says whether a
 * design asks for any standing, and runs the hook. The rest — the behaviours, the host that
 * runs them, the temperaments and the rules that resolve them (`core/kit.ts`) — is one chunk,
 * fetched the first time a design asks. An owl that is asked to stand does so a moment after
 * it arrives, which a reader cannot tell from a behaviour that starts at a random point in
 * its cycle.
 */

/** The ids a design has switched on, in a stable order. */
export function enabledStanding(standing: OwlDesign['standing']): string[] {
  return Object.keys(standing)
    .filter((id) => standing[id])
    .sort()
}

const kit = lazy(() => import('./core/kit'))

/**
 * Does anything ask for standing at all: a temperament, a `standing` record, or a tuned
 * value in this scope? The owl as sent asks for none, and `resolveStanding` hands it back
 * as it is, which is also what working it through the rules comes to.
 */
export function wantsStanding(design: OwlDesign, tuned: Readonly<Record<string, TuneValue>>): boolean {
  return (
    design.temperament !== null ||
    Object.keys(design.standing).length > 0 ||
    Object.keys(tuned).some((id) => id.startsWith(STANDING_PREFIX))
  )
}

/**
 * `design` with its temperament, its `standing` record and the panel's knobs worked into one
 * record. For a design that asks for standing this needs the rules, which are fetched with
 * the first such design (`useStandingKit`); until they arrive it is the design as it
 * stands, with nothing on.
 */
export function resolveStanding(design: OwlDesign, tuned: Readonly<Record<string, TuneValue>>): OwlDesign {
  if (!wantsStanding(design, tuned)) return design
  return kit.get()?.resolve(design, tuned) ?? design
}

/** The standing code, once it has arrived, for a design that `wantsStanding`; asks for nothing otherwise. */
export function useStandingKit(wanted: boolean) {
  return useLazy(wanted ? kit : null)
}

/** Fetch the standing code: for what has to have it before it renders, which is the tests. */
export function loadStandingKit() {
  return kit.load()
}

/** For the code that has the standing code in hand (`core/all.ts`). */
export function provideStandingKit(module: typeof import('./core/kit')): void {
  kit.provide(module)
}

/**
 * Run every standing behaviour the design has on, for as long as the owl is mounted and
 * the set does not change. Nothing runs for a reader who has asked for reduced motion, and
 * what is running stops if they ask while it does.
 *
 * Changing a value in the panel does not restart anything: the behaviours are told, and
 * move to the new amount and period from where they are.
 *
 * With nothing on, which is the owl as sent, this fetches nothing and runs nothing.
 */
export function useStanding(svg: RefObject<SVGSVGElement | null>, design: OwlDesign): void {
  const key = enabledStanding(design.standing).join(' ')
  const host = useStandingKit(key !== '')

  useEffect(() => {
    const el = svg.current
    if (!el || !host || key === '') return
    return host.start(el, key.split(' '), design)
    // `design` is deliberately not a dependency: the behaviours are told about a new
    // amount or period (the effect below) and move to it from where they are, and
    // restarting every cycle on each knob drag would be the owl jumping under the hand
    // that is moving the knob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, key, host])

  // A new amount or period, or the scan finish going on or off (which changes whether
  // looped motion is stepped), arrives as a new design.
  useEffect(() => {
    const el = svg.current
    if (el && host) host.update(el, design)
  }, [svg, design, host])
}
