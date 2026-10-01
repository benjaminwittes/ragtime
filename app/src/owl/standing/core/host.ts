import type { OwlDesign, OwlPart, OwlStanding, StandingConfig, StandingContext } from '../../types'
import { stepify } from './frames'
import { gap, hashSeed, seeded, unit } from './rng'

/**
 * What runs standing behaviours: one host per owl, one context per behaviour.
 *
 * **How behaviours compose.** CSS lets an element have one `transform` and one `animation`
 * list, so two stylesheets that both wanted to move the body would overwrite each other,
 * and adding a behaviour would mean editing the ones before it. The Web Animations API has
 * no such limit: an element can carry any number of animations, and `composite: 'add'`
 * makes each one *add* to the value beneath it instead of replacing it. For `transform`,
 * adding is concatenating the transform lists, and for `opacity` it is adding the numbers.
 * So every behaviour here animates a part (`../../parts.ts`) with its own animation, in its
 * own keyframes, and they stack: breathing and a sway on the same figure, a droop on top
 * of the stylesheet's blink on the eyes. A behaviour knows nothing of the others, and a new
 * one is a new file. Each part carries its own pivot, so a behaviour only says *how far*.
 *
 * It also costs the stage nothing. These animations are not in the markup the stage's
 * mirror copies, they write no attribute and no style, and they are not in the stylesheet:
 * an owl that is moving is, to a page that serialises its DOM, an owl that is still.
 *
 * **Cleanup is the host's.** Everything a behaviour makes through its context — an
 * animation, a timer, a listener, an element — is tracked, so that a behaviour has no
 * teardown to forget and stopping an owl leaves it as it was drawn.
 *
 * **Idle costs nothing.** While the tab is hidden or the owl is off screen the host pauses
 * every animation and every timer; occasional gestures are not drawn, and a gesture that
 * would have fired is simply not.
 */

export type HostInput = {
  svg: SVGSVGElement
  design: OwlDesign
  behaviours: ReadonlyMap<string, OwlStanding>
  /** The behaviours to run, in the order they start. */
  ids: readonly string[]
  configs: Readonly<Record<string, StandingConfig>>
  /** Fixes every random draw and every starting phase, so a run can be replayed. */
  seed: number
}

export type Host = {
  /** The settings changed: tell every behaviour. */
  update(configs: Readonly<Record<string, StandingConfig>>): void
  stop(): void
  readonly paused: boolean
}

type Target = OwlPart | SVGElement | readonly (OwlPart | SVGElement)[]

export function startHost(input: HostInput): Host {
  const { svg, design, behaviours, ids, seed } = input
  let configs = input.configs
  let paused = false
  let stopped = false
  const animations = new Set<Animation>()
  const watchers = new Set<() => void>()
  const arms = new Set<{ arm(): void; disarm(): void }>()
  const cleanups: (() => void)[] = []

  const config = (id: string): StandingConfig =>
    configs[id] ?? { amount: 1, period: behaviours.get(id)?.period ?? 1, fps: 0 }

  const resolve = (target: Target): SVGElement[] => {
    if (typeof target === 'string') {
      const el = svg.querySelector<SVGElement>(`[data-part="${target}"]`)
      return el ? [el] : []
    }
    return Array.isArray(target) ? target.flatMap(resolve) : [target as SVGElement]
  }

  function pauseAll(next: boolean) {
    if (next === paused || stopped) return
    paused = next
    for (const a of animations) {
      if (paused) a.pause()
      else a.play()
    }
    for (const t of arms) {
      if (paused) t.disarm()
      else t.arm()
    }
  }

  // Hidden tab, or an owl scrolled out of view: nothing moves and nothing is scheduled.
  let hidden = typeof document !== 'undefined' && document.hidden
  let seen = true
  const settle = () => pauseAll(hidden || !seen)
  const onVisibility = () => {
    hidden = document.hidden
    settle()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  let watching: IntersectionObserver | undefined
  if (typeof IntersectionObserver !== 'undefined') {
    watching = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (last) {
        seen = last.isIntersecting
        settle()
      }
    })
    watching.observe(svg)
  }
  paused = hidden

  function contextFor(id: string): StandingContext {
    const behaviour = behaviours.get(id) as OwlStanding
    const draw = seeded(hashSeed(id, seed))
    const phaseOf = (of: string) => unit('phase:' + of, seed)

    const ctx: StandingContext = {
      svg,
      design,
      get config() {
        return config(id)
      },
      configOf: (other) => (ids.includes(other) ? config(other) : undefined),
      watch(fn) {
        const run = () => fn(config(id))
        watchers.add(run)
        run()
      },
      rng: draw,
      phase: (of = id) => phaseOf(of),
      part: (name) => svg.querySelector<SVGGElement>(`[data-part="${name}"]`),
      all: (selector) => [...svg.querySelectorAll<SVGElement>(selector)],

      loop(target, frames, options) {
        const els = resolve(target)
        if (els.length === 0) return
        // The duration is the behaviour's own nominal cycle and the rate carries the
        // setting, so a period moved in the panel changes speed without a jump in phase.
        const duration = behaviour.period * 1000
        const start = (options?.phase ?? phaseOf(id)) % 1
        const keyframes = (cfg: StandingConfig) =>
          options?.own ? frames(cfg) : stepify(frames(cfg), cfg.period, cfg.fps)
        const made = els.map((el) => {
          const animation = el.animate(keyframes(config(id)), { duration, iterations: Infinity, composite: 'add' })
          animation.currentTime = start * duration
          if (paused) animation.pause()
          animations.add(animation)
          return animation
        })
        ctx.watch((cfg) => {
          // Keeping another behaviour's pace is the default; a period of its own, set away
          // from this behaviour's default, is a deliberate break from it.
          const other = options?.paceOf ? ctx.configOf(options.paceOf)?.period : undefined
          const pace = other !== undefined && cfg.period === behaviour.period ? other : cfg.period
          for (const animation of made) {
            const effect = animation.effect as KeyframeEffect | null
            effect?.setKeyframes(keyframes(cfg))
            animation.playbackRate = behaviour.period / Math.max(pace, 0.05)
          }
        })
      },

      gesture(targets, frames, timing) {
        const els = targets.flatMap(resolve)
        if (stopped || els.length === 0) return Promise.resolve()
        const made = els.map((el) => {
          const animation = el.animate(frames, { ...timing, composite: 'add', fill: 'none' })
          animations.add(animation)
          return animation
        })
        return Promise.all(made.map((a) => a.finished.catch(() => undefined))).then(() => {
          for (const a of made) animations.delete(a)
        })
      },

      every(fn, options) {
        const spread = options?.spread ?? 0.5
        let timer = 0
        const arm = () => {
          if (stopped || timer) return
          timer = window.setTimeout(() => {
            timer = 0
            if (paused) return
            fn()
            arm()
          }, gap(config(id).period, spread, draw()) * 1000)
        }
        const disarm = () => {
          window.clearTimeout(timer)
          timer = 0
        }
        const handle = { arm, disarm }
        arms.add(handle)
        cleanups.push(disarm)
        if (!paused) arm()
      },

      on(target, type, handler) {
        target.addEventListener(type, handler)
        cleanups.push(() => target.removeEventListener(type, handler))
      },

      add(parent, child) {
        parent.appendChild(child)
        cleanups.push(() => child.remove())
      },

      get paused() {
        return paused
      },
    }
    return ctx
  }

  for (const id of ids) {
    const behaviour = behaviours.get(id)
    if (!behaviour) continue
    const stop = behaviour.start(contextFor(id))
    if (stop) cleanups.push(stop)
  }

  return {
    update(next) {
      if (stopped) return
      configs = next
      for (const run of watchers) run()
    },
    stop() {
      if (stopped) return
      stopped = true
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      watching?.disconnect()
      for (const stop of cleanups) stop()
      for (const a of animations) a.cancel()
      animations.clear()
      watchers.clear()
      arms.clear()
    },
    get paused() {
      return paused
    },
  }
}
