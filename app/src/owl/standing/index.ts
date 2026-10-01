import { useEffect, type RefObject } from 'react'
import { temperamentMap } from '../temperaments'
import type { OwlDesign, OwlStanding, StandingConfig } from '../types'
import { applyStanding, standingConfigs, standingSeed } from './core/resolve'
import { startHost, type Host } from './core/host'
import { hashSeed } from './core/rng'
import type { TuneValue } from '@/tune/types'

/**
 * Standing behaviours: what the owl does when nobody is asking anything of it — breathing,
 * a shifted weight, a glance at nothing — and the print behaviours that belong to the
 * engraved, scanned look.
 *
 * To add one:
 *
 *   1. Add `standing/<id>.ts` whose default export is an `OwlStanding` (`../types.ts`).
 *      The glob below registers it; nothing else is edited. `start` builds the motion
 *      from the context's `loop` (a cycle) and `gesture` (one movement) and `every` (an
 *      irregular schedule): see `core/host.ts` for why those stack instead of fighting.
 *   2. Give it knobs in `../knobs/standing.ts` (a switch, an amount and a period), which
 *      is what the Tune panel shows, and list it in a temperament (`../temperaments/`)
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
 */

const modules = import.meta.glob<OwlStanding>(['./*.ts', '!./index.ts', '!./*.test.ts'], {
  eager: true,
  import: 'default',
})

const STANDING = new Map<string, OwlStanding>(
  Object.values(modules)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((behaviour) => [behaviour.id, behaviour]),
)

export function standingList(): OwlStanding[] {
  return [...STANDING.values()]
}

export function getStanding(id: string): OwlStanding | undefined {
  return STANDING.get(id)
}

/** The ids a design has switched on, in a stable order. */
export function enabledStanding(standing: OwlDesign['standing']): string[] {
  return Object.keys(standing)
    .filter((id) => standing[id])
    .sort()
}

/** `design` with its temperament, its `standing` record and the panel's knobs worked into one record. */
export function resolveStanding(design: OwlDesign, tuned: Readonly<Record<string, TuneValue>>): OwlDesign {
  return applyStanding(design, tuned, { behaviours: STANDING, temperaments: temperamentMap() })
}

/** Is the scan finish on this owl? It is the one case where every animated frame costs a filter pass. */
function scanning(svg: SVGSVGElement): boolean {
  return svg.querySelector('.eng-frame[filter]') !== null
}

function configsFor(design: OwlDesign, svg: SVGSVGElement): Record<string, StandingConfig> {
  return standingConfigs(design, scanning(svg), (id) => STANDING.get(id)?.period ?? 1)
}

let instances = 0

/**
 * The running host for an owl, found from its element, so the second effect below can reach
 * what the first started: to tell it a new amount, or to start it again for a new seed.
 */
const hostOf = new WeakMap<SVGSVGElement, { host(): Host | undefined; restart(): void }>()

/** The seed an owl's host was last started with. A seed is mixed into every draw at the start, so a new one means a start again. */
const seededWith = new WeakMap<SVGSVGElement, number>()

/** The design an owl was last rendered with, for a restart that must not use the one it mounted with. */
const latest = new WeakMap<SVGSVGElement, OwlDesign>()

/**
 * Run every standing behaviour the design has on, for as long as the owl is mounted and
 * the set does not change. Nothing runs for a reader who has asked for reduced motion, and
 * what is running stops if they ask while it does.
 *
 * Changing a value in the panel does not restart anything: the behaviours are told, and
 * move to the new amount and period from where they are.
 */
export function useStanding(svg: RefObject<SVGSVGElement | null>, design: OwlDesign): void {
  const key = enabledStanding(design.standing).join(' ')

  useEffect(() => {
    const el = svg.current
    if (!el || key === '') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    let host: Host | undefined
    // One seed for as long as this owl stands here, so a restart replays the same fidgets.
    const seed = hashSeed('owl', instances++)
    const run = () => {
      host?.stop()
      host = undefined
      if (query.matches) return
      const current = latest.get(el) ?? design
      seededWith.set(el, standingSeed(current))
      host = startHost({
        svg: el,
        design: current,
        behaviours: STANDING,
        ids: key.split(' '),
        configs: configsFor(current, el),
        seed: seed ^ standingSeed(current),
      })
    }
    run()
    query.addEventListener('change', run)
    // Behaviours hold the elements they were started on. If the drawing under them is
    // rebuilt — another render style, a screen with or without cross-hatching — those are
    // gone, so the behaviours start again on what replaced them. Only elements coming and
    // going count; a plate redrawn in place changes attributes, which is not observed.
    let again = 0
    const own = (node: Node) => node instanceof Element && node.classList.contains('owl-lightbar')
    const watching = new MutationObserver((records) => {
      // The light bar adds and removes itself, which is not the drawing changing.
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every(own))) return
      window.clearTimeout(again)
      again = window.setTimeout(run, 150)
    })
    watching.observe(el, { childList: true, subtree: true })
    hostOf.set(el, { host: () => host, restart: run })
    return () => {
      window.clearTimeout(again)
      watching.disconnect()
      query.removeEventListener('change', run)
      host?.stop()
      hostOf.delete(el)
      seededWith.delete(el)
    }
    // `design` is deliberately not a dependency: the behaviours are told about a new
    // amount or period (the effect below) and move to it from where they are, and
    // restarting every cycle on each knob drag would be the owl jumping under the hand
    // that is moving the knob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, key])

  // A new amount or period, or the scan finish going on or off (which changes whether
  // looped motion is stepped), arrives as a new design.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    latest.set(el, design)
    const running = hostOf.get(el)
    if (!running) return
    // The seed is not a setting a behaviour can be told: it is what every draw and every
    // starting phase was made from. A new one starts the behaviours again (once, on the
    // change), so the Seed knob does something when it is moved and not only on the next mount.
    if (seededWith.has(el) && seededWith.get(el) !== standingSeed(design)) running.restart()
    else running.host()?.update(configsFor(design, el))
  }, [svg, design])
}
