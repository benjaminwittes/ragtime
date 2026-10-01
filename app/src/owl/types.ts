import type { ComponentType, ReactNode } from 'react'
import type { TuneValue } from '@/tune/types'
import type { OWL_PARTS } from './parts'

/**
 * The owl module's vocabulary, in one file so that the registries (styles, variants,
 * standing behaviours) and the code that reads them can all import it without importing
 * each other.
 */

export type OwlPose = 'archivist' | 'stacks'

/**
 * `dark` is the drawing as sent: the lantern has its flame and throws no light. `lit` adds
 * a steady glow around it; `searching` breathes that glow, for while something is being
 * looked for.
 */
export type OwlLantern = 'dark' | 'lit' | 'searching'

/* -------------------------------------------------------------------------- */
/* The design                                                                  */
/* -------------------------------------------------------------------------- */

/** The concept sheet's eight inks, plus the two the sheet draws in plain white and navy. */
export const PALETTE_KEYS = [
  'navy',
  'cream',
  'slate',
  'wing',
  'tan',
  'gold',
  'lens',
  'flame',
  'page',
  'pupil',
] as const
export type PaletteKey = (typeof PALETTE_KEYS)[number]

/** One pose's own measurements, in the sheet's 100×100 units. */
export type PoseGeometry = {
  body: string
  head: string
  face: { cy: number; r: number }
  eyes: { left: number; right: number; cy: number; r: number; pupil: number }
  beak: string
  belly: { cy: number; rx: number; ry: number }
  wings: readonly { cx: number; cy: number; rx: number; ry: number }[]
  lantern: {
    handle: { x: number; y1: number; y2: number }
    frame: { x: number; y: number; width: number; height: number }
    flame: { x: number; y: number; width: number; height: number }
  }
  books: readonly { x: number; y: number; width: number }[]
}

/**
 * Everything that makes one owl differ from another, as data. A variant is a partial of
 * this (`OwlVariant`), and a tuned knob is one path in it (`owl.design.<path>`).
 *
 * Which of these are plain numbers and strings that a knob can move, and which are
 * structure a knob cannot (the pose tables), is the split described in `design.ts`.
 */
export type OwlDesign = {
  /** The id of a registered render style (`styles/`). */
  style: string
  palette: Record<PaletteKey, string>
  /** Line weights, in figure units. */
  stroke: { rim: number; book: number; lantern: number; handle: number }
  /** Sizes of the shapes that are not part of a pose's own table. */
  shape: {
    disc: number
    bookHeight: number
    bookRadius: number
    lanternRadius: number
    glowRadius: number
    glowCore: number
  }
  motion: {
    /** Does the owl blink at all, and how often (seconds), and how far the lids close (scaleY). */
    blink: boolean
    blinkPeriod: number
    blinkClosed: number
    /** Do the eyes follow a pointer, how far (a share of the lens radius), and how fast (ms). */
    gazeFollow: boolean
    gazeTravel: number
    gazeEase: number
    /** The lit lantern's glow: how bright, and how long it takes to come up (ms). */
    glowLit: number
    glowFade: number
    /** The searching pulse: one breath in seconds, and the brightness it moves between. */
    searchPeriod: number
    searchLow: number
    searchHigh: number
    /** The head-shake: how long (ms) and how far (figure units). */
    shakeTime: number
    shakeReach: number
  }
  /** The hours an owl that keeps them lights its lantern unasked: from this hour to that one. */
  night: { from: number; until: number }
  /**
   * Which standing (idle) behaviours are on, by id (`standing/`). Empty for the owl as
   * sent. Switching one on is `{ standing: { breathe: true } }` in a variant, and what a
   * temperament (`temperament`) switches on is laid into it when the design is resolved
   * (`standing/resolve.ts`), so everything downstream reads this one record.
   */
  standing: Record<string, boolean>
  /**
   * The id of a temperament (`temperaments/`): a named set of standing behaviours and how
   * strongly each runs. Null is none. A variant names one; the panel's knob wins over it.
   */
  temperament: string | null
  /** The id of the voice an owl speaks in, when speech exists (`speech.ts`). */
  voice: string | null
  /**
   * Free parameters that belong to a render style or a behaviour and to nothing else:
   * `params.engraved.hatchAngle`. Keeping them under one key lets a style add knobs of
   * its own without changing this type.
   */
  params: Record<string, Record<string, TuneValue>>
  poses: Record<OwlPose, PoseGeometry>
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type OwlDesignPatch = DeepPartial<OwlDesign>

/**
 * A specimen: a design patch laid over everything, with its own standing knobs
 * (`owl.standing.<id>.amount` and the like), and the panel's standing knobs ignored. For a
 * lab row that has to stay what it says while the panel moves every other owl.
 */
export type OwlPin = {
  design?: OwlDesignPatch
  knobs?: Readonly<Record<string, TuneValue>>
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A named partial override of the base design: look and behaviour together. The base
 * variant is the empty patch — the drawing as sent.
 */
export type OwlVariant = {
  id: string
  label: string
  /** One line, shown beside the variant in the panel and the lab. */
  note?: string
  design: OwlDesignPatch
}

/* -------------------------------------------------------------------------- */
/* Render styles                                                               */
/* -------------------------------------------------------------------------- */

/** What a style is handed for each layer it draws. */
export type LayerProps = {
  design: OwlDesign
  poseId: OwlPose
  pose: PoseGeometry
}

/**
 * A render style draws the owl's *body*; the scaffold (`scaffold.tsx`) owns everything
 * the rest of the site depends on — the root element and its attributes, the eyes and
 * pupils the gaze moves, the glow the lantern state fades, the gradient it paints with,
 * and the part groups (`parts.ts`) every layer sits in. So a style cannot forget the DOM
 * contract, because it is not given the chance to write it. The scaffold paints in this
 * order, each layer inside the part named beside it:
 *
 *   `defs`
 *   ground                                     (`ground`)
 *   body                                       (`body`)
 *   head, eyes, pupils, rims, `eyeDetail`, beak  (`head`, and `features` for what is on the face)
 *   belly                                      (`belly`)
 *   `wing` left, `wing` right                  (`wing-l`, `wing-r`)
 *   glow, `lantern`                            (`lantern`)
 *
 * (`headLast` moves the head group to after the wings.)
 *
 * The split follows the drawing and is what lets a behaviour move the head as a head: a
 * style draws the head's parts in its own layers, the scaffold groups them. A style that
 * wants hatching over the eyes puts it in `eyeDetail`; one that wants a different beak
 * draws it in `beak`.
 */
export type OwlStyle = {
  id: string
  label: string
  /**
   * Paint the head group after the belly and the wings instead of before them. Nothing
   * overlaps at rest, so the choice does not change what the owl looks like; it exists
   * because a renderer can rasterise the same shapes a shade differently when they come in
   * a different order, and a style should be able to keep the order it was tuned in. The
   * flat style keeps the concept sheet's (head first); the engraved style's thousands of
   * thin ribbons are tuned the other way.
   */
  headLast?: boolean
  /** Extra `<defs>` content — patterns, filters. The glow gradient is the scaffold's. */
  defs?: ComponentType<LayerProps>
  /**
   * Wraps everything painted after `defs` — the eyes and the glow included — in one element
   * of the style's own, for what has to act on the whole figure at once (a filter, a
   * transform). It must render its children and nothing around them that the DOM contract
   * needs.
   */
  frame?: ComponentType<LayerProps & { children: ReactNode }>
  /** What the figure stands on and in front of: the disc and the books. It never moves with the owl. */
  ground: ComponentType<LayerProps>
  /** The torso. */
  body: ComponentType<LayerProps>
  /** The head and the face: the shapes the eyes sit on. */
  head: ComponentType<LayerProps>
  /** Over the eyes and their rims, under the beak. Optional. */
  eyeDetail?: ComponentType<LayerProps>
  beak: ComponentType<LayerProps>
  belly: ComponentType<LayerProps>
  /** One wing; drawn once for each side. */
  wing: ComponentType<LayerProps & { side: WingSide }>
  /** Lantern hardware — handle, frame, flame — over the glow. */
  lantern: ComponentType<LayerProps>
}

/** `l` is the owl's own left, the left of the picture: the first wing in a pose's table. */
export type WingSide = 'l' | 'r'

/* -------------------------------------------------------------------------- */
/* Standing behaviours                                                         */
/* -------------------------------------------------------------------------- */

/** What a behaviour runs on, after its temperament and the panel have had their say. */
export type StandingConfig = {
  /** 1 is the behaviour's own default strength; a behaviour scales its distances by it. */
  amount: number
  /** Seconds for one cycle, or the mean gap between occasional gestures. */
  period: number
  /** Frames a second for looped motion that should be stepped; 0 is smooth. */
  fps: number
}

/** The part names behaviours address; see `parts.ts`. */
export type OwlPart = (typeof OWL_PARTS)[number]

/** A CSS property map for `Element.animate`, with the one thing that is not optional. */
export type Frames = Keyframe[]

export type StandingContext = {
  svg: SVGSVGElement
  design: OwlDesign
  /** This behaviour's settings now. Use `watch` to follow them. */
  readonly config: StandingConfig
  /** Another behaviour's settings, or undefined when it is not running on this owl. */
  configOf(id: string): StandingConfig | undefined
  /** Calls `fn` now, and again whenever the settings change (the panel, the scan finish). */
  watch(fn: (config: StandingConfig) => void): void
  /** A random number in [0, 1) from this owl's own stream for this behaviour: seeded, so a run can be replayed. */
  rng(): number
  /** Where in its cycle this owl begins one behaviour, so owls and behaviours do not move in unison. */
  phase(id?: string): number
  /** The group for a part, or null when the style has none. */
  part(name: OwlPart): SVGGElement | null
  /** Elements inside the figure by selector. */
  all(selector: string): SVGElement[]
  /**
   * A looped motion on `target`, added on top of whatever else acts on it. `frames` is
   * called with the current settings whenever they change, and returns one cycle of
   * keyframes (offsets and all). The cycle runs for `config.period`, starting part-way
   * through at this owl's phase. Stepped when `config.fps` is set.
   */
  loop(
    target: OwlPart | SVGElement | readonly (OwlPart | SVGElement)[],
    frames: (config: StandingConfig) => Frames,
    options?: {
      /** Where in the cycle to start, 0 to 1. Default: this behaviour's phase for this owl. */
      phase?: number
      /**
       * Keep another running behaviour's pace, so that two effects of one breath stay one
       * breath, unless this behaviour's own period has been moved off its default. Both
       * need the same default period.
       */
      paceOf?: string
      /** The keyframes carry their own stepping: do not step them again when stepping is on. */
      own?: boolean
    },
  ): void
  /**
   * One motion, played once, on top of whatever else acts on the targets, and gone after.
   * Several targets share one clock. Resolves when it ends.
   */
  gesture(targets: (OwlPart | SVGElement)[], frames: Frames, timing: { duration: number; easing?: string }): Promise<void>
  /**
   * Calls `fn` at irregular intervals averaging `config.period` seconds, each gap drawn from
   * `[1 - spread, 1 + spread] × mean`. Waits while the owl is hidden or off screen.
   */
  every(fn: () => void, options?: { spread?: number }): void
  /** A listener removed with the behaviour. */
  on(target: EventTarget, type: string, handler: (event: Event) => void): void
  /** An element the behaviour adds to the figure, removed with it. */
  add(parent: Element, child: Element): void
  /** True while the owl is hidden or off screen. */
  readonly paused: boolean
}

/**
 * An idle behaviour: something the owl does when nobody is asking anything of it. It is
 * data plus code. The root carries `data-standing="<ids>"` for every one that is on, and
 * `start` — only called for a reader who has not asked for reduced motion — builds the
 * motion with the context's `loop` and `gesture`, which add to one another instead of
 * replacing (`standing/kit.ts` says how), so behaviours never need to know about each
 * other. Cleanup is the context's: what a behaviour made through it is undone with it.
 *
 * The house rule applies: nothing a standing behaviour does may move a pixel outside the
 * figure's own box.
 */
export type OwlStanding = {
  id: string
  label: string
  /** For people: what it does, in a line, for the panel and the lab. */
  note: string
  /** The cycle, or mean gap, in seconds at amount and period 1. */
  period: number
  start(context: StandingContext): void | (() => void)
}

/**
 * A temperament: a named set of behaviours and how strongly each runs. Variance as data.
 * A behaviour that is listed is on; `amount` and `period` multiply its own defaults.
 */
export type OwlTemperament = {
  id: string
  label: string
  /** One line, shown beside the temperament in the panel and the lab. */
  note: string
  behaviours: Readonly<Record<string, { amount?: number; period?: number }>>
  /**
   * Whether looped motion is stepped: always, never, or only when the scan finish is on
   * (the default), where every frame costs a filter pass.
   */
  step?: StepMode
}

export type StepMode = 'auto' | 'always' | 'never'

/* -------------------------------------------------------------------------- */
/* Embedding                                                                   */
/* -------------------------------------------------------------------------- */

export type OwlSiteId = 'hub' | 'explorer' | 'gate' | 'not-found' | 'stage' | 'record'

/** How the owl is placed on one page. The table is `embeds.ts`. */
export type OwlSite = {
  /** For people: where this is. */
  label: string
  pose: OwlPose
  /** The lantern when the call site gives none. */
  lantern: OwlLantern
  /** Lit after dark by the reader's clock. */
  keepsHours: boolean
  /** Names the owl for assistive technology; omit where text beside it speaks for it. */
  title?: string
  /** Pins a variant here. A tuned `owl.embed.<id>.variant` wins over it; none follows the global one. */
  variant?: string
  /**
   * Classes on the owl's own `<svg>`. `--owl-size` and (where a site has a second size)
   * `--owl-size-sm` are set on the element that carries the width, from the knobs in
   * `knobs/embeds.ts`.
   */
  className: string
  /**
   * Set where the page wraps the owl in a figure of its own (`SurfaceIntro`): the classes
   * for that wrapper, which is what carries the width. Without it the `<svg>` carries the
   * width itself.
   */
  figureClassName?: string
}
