import type { ComponentType, ReactNode } from 'react'
import type { TuneValue } from '@/tune/types'

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
   * Which standing (idle) behaviours are on, by id (`standing/`). Empty today.
   * Switching one on is `{ standing: { breathe: true } }` in a variant.
   */
  standing: Record<string, boolean>
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
 * pupils the gaze moves, the glow the lantern state fades, the gradient it paints with.
 * So a style cannot forget the DOM contract, because it is not given the chance to write
 * it. The scaffold paints in this order:
 *
 *   `defs`  →  `behind`  →  eyes, pupils, rims  →  `eyeDetail`  →  `front`  →  glow  →  `lantern`
 *
 * The split follows the drawing: the eyes sit on the face but under the beak, so a style
 * that wants a different beak puts it in `front`, and one that wants hatching over the
 * eyes puts it in `eyeDetail`.
 */
export type OwlStyle = {
  id: string
  label: string
  /** Extra `<defs>` content — patterns, filters. The glow gradient is the scaffold's. */
  defs?: ComponentType<LayerProps>
  /**
   * Wraps everything painted after `defs` — the eyes and the glow included — in one element
   * of the style's own, for what has to act on the whole figure at once (a filter, a
   * transform). It must render its children and nothing around them that the DOM contract
   * needs.
   */
  frame?: ComponentType<LayerProps & { children: ReactNode }>
  /** Ground, books, body, head, face: everything behind the eyes. */
  behind: ComponentType<LayerProps>
  /** Over the eyes and their rims, under the beak. Optional. */
  eyeDetail?: ComponentType<LayerProps>
  /** Beak, belly, wings: in front of the face. */
  front: ComponentType<LayerProps>
  /** Lantern hardware — handle, frame, flame — over the glow. */
  lantern: ComponentType<LayerProps>
}

/* -------------------------------------------------------------------------- */
/* Standing behaviours                                                         */
/* -------------------------------------------------------------------------- */

export type StandingContext = {
  svg: SVGSVGElement
  design: OwlDesign
}

/**
 * An idle behaviour: something the owl does when nobody is asking anything of it. It is
 * data plus, optionally, code. The root carries `data-standing="<ids>"` for every one
 * that is on, so a purely CSS behaviour is a stylesheet keyed on that attribute and
 * needs no `start`. One that needs a timer or a listener implements `start`, which is
 * only called for a reader who has not asked for reduced motion, and returns its own
 * cleanup.
 *
 * The house rule applies: nothing a standing behaviour does may move a pixel outside the
 * figure's own box.
 */
export type OwlStanding = {
  id: string
  label: string
  start?: (context: StandingContext) => void | (() => void)
}

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
