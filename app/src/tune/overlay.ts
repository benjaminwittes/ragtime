/**
 * The overlay: tuned token values, applied to the live page as one stylesheet.
 *
 * Why a stylesheet rather than inline styles on the elements. A surface's
 * selector may match more than one element, may match none yet, and may be
 * replaced by React at any moment; a rule keyed on the same selector the
 * stylesheet uses tracks all of that for free. It is also the form that makes
 * the seam honest — the overlay is the *same kind of thing* as the declaration
 * it is overriding, one specificity point louder (see `overlaySelector`), so
 * what you see while dragging is what the file will do once written.
 *
 * Dev-only: loaded by `mount.tsx`, which is itself behind `TUNE_ENABLED`.
 */

import { allTunables, getTunable, overlaySelector } from './registry'
import { subscribeTune, tuneOverrides } from './store'
import type { TuneValue } from './types'

const STYLE_ID = 'rt-tune-overlay'

function cssValue(value: TuneValue): string {
  return typeof value === 'string' ? value : String(value)
}

/** The overlay's whole text: one rule per selector that has a tuned token. */
export function overlayCss(): string {
  const bySelector = new Map<string, string[]>()
  for (const [id, value] of Object.entries(tuneOverrides())) {
    const knob = getTunable(id)
    if (!knob?.prop) continue // runtime knob — React reads it, CSS does not
    const selector = overlaySelector(knob)
    const decls = bySelector.get(selector) ?? []
    decls.push(`  ${knob.prop}: ${cssValue(value)};`)
    bySelector.set(selector, decls)
  }
  return [...bySelector.entries()]
    .map(([selector, decls]) => `${selector} {\n${decls.join('\n')}\n}`)
    .join('\n\n')
}

/**
 * The same thing in the shape you would paste into a stylesheet: real
 * selectors, no specificity doubling, grouped and commented by scope. This is
 * what "Copy CSS" hands over, and what a tuning looks like when it leaves the
 * browser without going through the dev server.
 */
export function overlayCssForSource(): string {
  const overrides = tuneOverrides()
  const blocks: string[] = []
  const scopes = new Map<string, { selector: string; decls: string[] }>()
  for (const knob of allTunables()) {
    if (!knob.prop) continue
    if (!Object.prototype.hasOwnProperty.call(overrides, knob.id)) continue
    const key = `${knob.source.file}::${knob.source.selector ?? ''}`
    const entry = scopes.get(key) ?? {
      selector: knob.source.selector ?? ':root',
      decls: [],
    }
    entry.decls.push(`  ${knob.prop}: ${cssValue(overrides[knob.id])};`)
    scopes.set(key, entry)
  }
  for (const [key, { selector, decls }] of scopes) {
    const file = key.split('::')[0]
    blocks.push(`/* ${file} */\n${selector} {\n${decls.join('\n')}\n}`)
  }

  const runtime = allTunables().filter(
    (k) => !k.prop && Object.prototype.hasOwnProperty.call(overrides, k.id),
  )
  if (runtime.length > 0) {
    const lines = runtime.map(
      (k) => `  ${k.id}: ${JSON.stringify(overrides[k.id])}   /* ${k.source.file} */`,
    )
    blocks.push(`/* runtime knobs — not CSS; write these to source */\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}

/**
 * Install the overlay and keep it in step with the store. Returns a teardown
 * that removes both the subscription and the element.
 */
export function installTuneOverlay(): () => void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  const paint = () => {
    if (style) style.textContent = overlayCss()
  }
  paint()
  const unsubscribe = subscribeTune(paint)
  return () => {
    unsubscribe()
    style?.remove()
    style = null
  }
}
