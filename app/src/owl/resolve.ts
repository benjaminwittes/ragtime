import type { TuneValue } from '@/tune/types'
import type { OwlDesign, OwlDesignPatch } from './types'

/**
 * How an owl's design is worked out, as plain functions of plain data — no registry, no
 * store, no React — so the rules can be tested in a node environment
 * (`resolve.test.ts`). `useOwlDesign.ts` is the one place that feeds them the live
 * registries and the live tuned values.
 *
 * The order of precedence, lowest to highest:
 *
 *   1. the base design: the structure in `design.ts` plus every knob's declared default;
 *   2. the variant's patch, merged over it;
 *   3. a tuned knob — a value somebody is moving in the panel *now*.
 *
 * A tuned knob beats the variant on purpose. If it did not, dragging the palette while a
 * variant that sets its own palette is active would move nothing, and a slider that does
 * nothing reads as a broken tool.
 */

/** Knobs whose id starts with this are paths into `OwlDesign`: `owl.design.palette.navy`. */
export const DESIGN_PREFIX = 'owl.design.'

/** The path a knob id names inside the design, or null for a knob that is not part of it. */
export function designPath(id: string): string[] | null {
  if (!id.startsWith(DESIGN_PREFIX)) return null
  const path = id.slice(DESIGN_PREFIX.length).split('.')
  return path.every(safeKey) ? path : null
}

// A path comes from a knob id, and an id can come from a preset in a URL.
function safeKey(key: string): boolean {
  return key !== '' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A copy of `target` with one path set. Objects along the way are copied and missing ones
 * made, so `params.engraved.hatchAngle` can be set on a design that has no `engraved` yet;
 * nothing is mutated, because the base design is shared by every owl on the page.
 */
export function withPath<T extends object>(target: T, path: readonly string[], value: unknown): T {
  const [head, ...rest] = path
  if (head === undefined) return target
  const current = (target as Record<string, unknown>)[head]
  const next = rest.length === 0 ? value : withPath(isPlain(current) ? current : {}, rest, value)
  return { ...target, [head]: next }
}

/**
 * `patch` laid over `base`, deeply. Plain objects merge; everything else — numbers,
 * strings, arrays, null — replaces. Arrays replace rather than merge because the only
 * arrays in a design are a pose's wings and books, and half a stack of books is not a
 * thing anyone means.
 */
export function mergeDesign<T extends object>(base: T, patch: object | undefined): T {
  if (!patch) return base
  let out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (!safeKey(key) || value === undefined) continue
    const current = out[key]
    out = {
      ...out,
      [key]: isPlain(value) && isPlain(current) ? mergeDesign(current, value) : value,
    }
  }
  return out as T
}

/**
 * The base design: `structure` (what a knob cannot express) with every default laid in
 * at the path its id names. Both halves are inputs, so the function knows nothing of
 * where either lives.
 */
export function designFromDefaults(
  structure: Partial<OwlDesign>,
  defaults: Readonly<Record<string, TuneValue>>,
): OwlDesign {
  let design: object = structure
  for (const [id, value] of Object.entries(defaults)) {
    const path = designPath(id)
    if (path) design = withPath(design, path, value)
  }
  return design as OwlDesign
}

/** The base, then each patch in turn, then the tuned values. */
export function resolveDesign(
  base: OwlDesign,
  patches: readonly (OwlDesignPatch | undefined)[],
  tuned: Readonly<Record<string, TuneValue>>,
): OwlDesign {
  let design = base
  for (const patch of patches) design = mergeDesign(design, patch)
  for (const [id, value] of Object.entries(tuned)) {
    const path = designPath(id)
    if (path) design = withPath(design, path, value)
  }
  return design
}

/**
 * The first variant id in `choices` that says something: `undefined` and `'inherit'` (how a
 * site's knob says it has no opinion) are passed over. Callers list their layers most
 * specific first — the variant a caller asked for, the one picked for the site in the
 * panel, the one the site's table pins, the one picked for every owl.
 */
export function firstChoice(...choices: (string | undefined)[]): string | undefined {
  return choices.find((choice) => choice !== undefined && choice !== '' && choice !== 'inherit')
}

/** `firstChoice`, or the base when nobody chose. */
export function pickVariantId(...choices: (string | undefined)[]): string {
  return firstChoice(...choices) ?? 'base'
}

/**
 * Is `hour` (0–23) inside the owl's night? The window may wrap midnight, as the default
 * one does: eight in the evening until six in the morning.
 */
export function isNight(hour: number, night: OwlDesign['night']): boolean {
  if (night.from === night.until) return false
  return night.from < night.until
    ? hour >= night.from && hour < night.until
    : hour >= night.from || hour < night.until
}
