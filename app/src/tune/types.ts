/**
 * Tuning-registry types.
 *
 * A *tunable* is one named parameter of the design that someone can move while
 * looking at the page, and that the page visibly answers. Two kinds, one
 * declaration shape:
 *
 *   - a **token knob** drives a CSS custom property (`prop`), so moving it
 *     repaints every rule and every Tailwind utility that reads that property;
 *   - a **runtime knob** has no `prop`, and page code reads it with
 *     `useTunable(id)` — how many examples the empty state offers, how many
 *     rows a result table previews. Not everything that visibly affects output
 *     is a colour.
 *
 * Every knob names the place in source its value is declared (`source`), which
 * is what lets the panel's "Write to source" put a tuned value back where it
 * came from instead of leaving it stranded in a browser tab. The registry is
 * the reusable half: a page declares its knobs the way a spoke declares its
 * docs entries (`src/docs/registry.ts`), so a surface that does not exist yet
 * costs one file to make tunable.
 */

/** What kind of control the panel draws, and how the value is parsed. */
export type TuneKind =
  /** A CSS colour. The panel shows a swatch plus the authored string, so
   *  `oklch(…)`, `#hex` and `color-mix()` all stay typable. */
  | 'color'
  /** A number with a unit (`80ch`, `0.625rem`, `1.45fr`). Slider + unit. */
  | 'length'
  /** A bare number — a ratio, a count, a threshold. */
  | 'number'
  /** A bare integer. Same control, step 1, written without a decimal point. */
  | 'int'
  | 'boolean'
  /** One of a fixed set (`options`). */
  | 'select'
  /** Free text — a font stack, a shadow, anything the panel should not parse. */
  | 'text'

export type TuneValue = string | number | boolean

/**
 * Where a knob's value is declared in source, so the panel can write a tuned
 * value back to it.
 *
 * `file` is repo-relative to `app/` and must stay under `app/src/` — the dev
 * middleware refuses anything else. `selector` is the CSS block the property is
 * declared in and is required for token knobs: the first block in the file
 * whose selector matches exactly (`:root`, `@theme`, `@theme inline`,
 * `.explorer`, `[data-tune="hub"]`). A runtime knob has no selector; its value
 * is the `value:` field of its own declaration, patched in place.
 */
export type TuneSource = { file: string; selector?: string }

export type Tunable = {
  /** Stable id, `scope.name` by convention. Serialized into presets and URLs. */
  id: string
  label: string
  /** Section heading inside the scope — "Colour", "Type", "Layout", "Behaviour". */
  group: string
  /** `'global'`, or the id of a registered surface. */
  scope: string
  kind: TuneKind
  /** The value as authored in source. The panel shows this as the default. */
  value: TuneValue
  /** The CSS custom property this knob drives, dashes included. Omit for a runtime knob. */
  prop?: string
  source: TuneSource
  min?: number
  max?: number
  step?: number
  /** Allowed units for a `length` knob; the first is the default. */
  units?: readonly string[]
  options?: readonly { label: string; value: string }[]
  /** One line under the control — what moving this knob is really doing. */
  note?: string
  /**
   * True when the declared value is a `var(…)` reference rather than a literal.
   * Tuning one is fine; *writing* one replaces the reference with a literal and
   * severs the seam that made it follow the theme, so the panel warns first.
   */
  derived?: boolean
}

/**
 * A surface is a page (or a page-shaped region) that owns knobs. Its `selector`
 * does double duty: the overlay scopes that surface's custom properties under
 * it, and the panel treats "this selector matches something in the DOM" as the
 * definition of *the surface you are looking at* — so no page has to announce
 * itself to the panel.
 */
export type TuneSurface = {
  id: string
  label: string
  selector: string
  /** Default source file for this surface's token knobs. */
  file: string
}
