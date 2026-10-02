import type { TuneValue } from '@/tune/types'
import { temperamentMap } from '../../temperaments'
import type { OwlDesign, OwlStanding, StandingConfig } from '../../types'
import { startHost, type Host } from './host'
import { applyStanding, standingConfigs, standingSeed } from './resolve'
import { hashSeed } from './rng'

/**
 * Everything standing needs that the owl as sent does not: the behaviours, the host that
 * runs them and the random streams it draws from, the temperaments, and the rules that work
 * a design's temperament and the panel's knobs into the behaviours that are on. One chunk,
 * fetched the first time a design asks for any standing (`../index.ts`), because a design
 * that asks for one behaviour is a design that is trying a character, and the lot is smaller
 * than the requests it would take to choose.
 *
 * The behaviours are the files next to `index.ts` (see there for how to add one).
 */

const modules = import.meta.glob<OwlStanding>(['../*.ts', '!../index.ts', '!../*.test.ts'], {
  eager: true,
  import: 'default',
})

const STANDING = new Map<string, OwlStanding>(
  Object.values(modules)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((behaviour) => [behaviour.id, behaviour]),
)

const IDS: ReadonlySet<string> = new Set(STANDING.keys())

export function standingList(): OwlStanding[] {
  return [...STANDING.values()]
}

export function getStanding(id: string): OwlStanding | undefined {
  return STANDING.get(id)
}

/** The ids of every registered behaviour. */
export function standingIds(): ReadonlySet<string> {
  return IDS
}

/** `design` with its temperament, its `standing` record and the panel's knobs worked into one record. */
export function resolve(design: OwlDesign, tuned: Readonly<Record<string, TuneValue>>): OwlDesign {
  return applyStanding(design, tuned, { ids: IDS, temperaments: temperamentMap() })
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
 * The running host for an owl, found from its element, so `update` can reach what `start`
 * made: to tell it a new amount, or to start it again for a new seed.
 */
const hostOf = new WeakMap<SVGSVGElement, { host(): Host | undefined; restart(): void }>()

/** The seed an owl's host was last started with. A seed is mixed into every draw at the start, so a new one means a start again. */
const seededWith = new WeakMap<SVGSVGElement, number>()

/** The design an owl was last rendered with, for a restart that must not use the one it mounted with. */
const latest = new WeakMap<SVGSVGElement, OwlDesign>()

/**
 * Run the behaviours `ids` on `el` until the function this returns is called. Nothing runs
 * for a reader who has asked for reduced motion, and what is running stops if they ask
 * while it does.
 */
export function start(el: SVGSVGElement, ids: readonly string[], design: OwlDesign): () => void {
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
      ids,
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
}

/**
 * The design `el` is drawn with now. A new amount or period, or the scan finish going on or
 * off, is told to the host and the behaviours move to it from where they are.
 */
export function update(el: SVGSVGElement, design: OwlDesign): void {
  latest.set(el, design)
  const running = hostOf.get(el)
  if (!running) return
  // The seed is not a setting a behaviour can be told: it is what every draw and every
  // starting phase was made from. A new one starts the behaviours again (once, on the
  // change), so the Seed knob does something when it is moved and not only on the next mount.
  if (seededWith.has(el) && seededWith.get(el) !== standingSeed(design)) running.restart()
  else running.host()?.update(configsFor(design, el))
}
