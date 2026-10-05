import type { ComponentType, CSSProperties } from 'react'

/**
 * The owl module's vocabulary, in one file so that the registries (styles, variants) and the
 * code that reads them can all import it without importing each other.
 */

export type OwlPose = 'archivist' | 'stacks'

/**
 * `dark` is the lantern with its flame and no light round it. `lit` adds a steady glow;
 * `searching` breathes it, for while something is being looked for.
 */
export type OwlLantern = 'dark' | 'lit' | 'searching'

/* -------------------------------------------------------------------------- */
/* The design                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What an owl is, as data: the render style, the ink it is drawn in, the hours it keeps, and
 * the voice it speaks in. A variant is a partial of this (`OwlVariant`), and a tuned knob is
 * one path in it (`owl.design.<path>`).
 */
export type OwlDesign = {
  /** The id of a registered render style (`styles/`). */
  style: string
  /** The ink the line tiles are drawn in. */
  palette: { navy: string }
  /** The hours an owl that keeps them lights its lantern unasked: from this hour to that one. */
  night: { from: number; until: number }
  /** The id of the voice an owl speaks in, when speech exists (`speech.tsx`). */
  voice: string | null
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type OwlDesignPatch = DeepPartial<OwlDesign>

/** A design patch laid over everything, the panel's values included, for a specimen that must stay what it is. */
export type OwlPin = {
  design?: OwlDesignPatch
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                    */
/* -------------------------------------------------------------------------- */

/** A named partial override of the base design. The base variant is the empty patch. */
export type OwlVariant = {
  id: string
  label: string
  /** One line, shown beside the variant in the panel. */
  note?: string
  design: OwlDesignPatch
}

/* -------------------------------------------------------------------------- */
/* Render styles                                                               */
/* -------------------------------------------------------------------------- */

/** What a style is handed: the design, the lantern after the night hours, and the box's own classes. */
export type OwlFigureProps = {
  design: OwlDesign
  poseId: OwlPose
  /** The lantern state to show, after the night hours have been applied. */
  lantern: OwlLantern
  className?: string
  style?: CSSProperties
  title?: string
}

/**
 * A render style draws the whole figure: the root element and its attributes (`data-owl`,
 * `data-lantern`, the box's classes) are its own to write (`contract.ts` lists them). The
 * drawing is a chunk of its own (`styles/index.ts`).
 */
export type OwlStyle = {
  id: string
  label: string
  figure: ComponentType<OwlFigureProps>
}

/**
 * What a style is called, kept apart from how it draws (`styles/<name>/meta.ts`), so the list
 * of styles is known without loading any drawing code.
 */
export type OwlStyleMeta = Pick<OwlStyle, 'id' | 'label'>

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
