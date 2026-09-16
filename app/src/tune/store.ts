/**
 * The tuned-value store: the thin, production-safe half of the tuning tool.
 *
 * Everything the running app needs in order to *read* a tuned value lives here
 * — a map of overrides, a subscription, and a boot-time hydration from the URL
 * and localStorage. The panel, the overlay writer, the preset editor and the
 * write-to-source client are all elsewhere and are loaded only when tuning is
 * enabled, so a plain production build keeps this file and drops the rest.
 *
 * `TUNE_ENABLED` is what makes that true. It reads `__RT_TUNE__`, which Vite
 * substitutes as a literal (`env.d.ts`, `vite.config.ts`), so in a production
 * build every branch guarded by it — the hydration at the foot of this file
 * included — is dead code the bundler removes. What survives is `tuneValue()`
 * returning the declared default, which is exactly what the app did before any
 * of this existed.
 */

import { getTunable } from './registry'
import type { TuneValue } from './types'

/**
 * Is the tuning layer live?
 *
 *   - `npm run dev` → yes, with write-to-source (the dev middleware is there).
 *   - `VITE_TUNER=1 npm run build` → yes, without write-to-source. This is the
 *     branch-deploy case: a preview someone can tune in front of you, where the
 *     way a tuning leaves the room is a URL, not a file edit.
 *   - `npm run build` → no. Not in the bundle at all.
 */
// The `typeof` guard is for Vitest, which runs without Vite's `define`; under
// the define it folds to the literal alongside everything it guards.
export const TUNE_ENABLED =
  typeof __RT_TUNE__ !== 'undefined' ? __RT_TUNE__ : false

/** True only where a Vite dev server is listening to take a write. */
export const TUNE_CAN_WRITE = import.meta.env.DEV

const SESSION_KEY = 'ragtime.tune.session'
const PRESETS_KEY = 'ragtime.tune.presets'

export type TuneOverrides = Record<string, TuneValue>
export type TunePresets = Record<string, TuneOverrides>

let overrides: TuneOverrides = {}
/** The preset named in the URL, if the page was opened on one. */
let urlPreset: string | null = null

const listeners = new Set<() => void>()
let version = 0

function notify() {
  version++
  for (const fn of listeners) fn()
}

/**
 * A number that changes whenever any tuned value does.
 *
 * The panel subscribes to *this* rather than to the override map, because
 * `useSyncExternalStore` compares snapshots with `Object.is` and a map rebuilt
 * on every read would re-render forever. Values are read during render instead.
 */
export function tuneVersion(): number {
  return version
}

export function subscribeTune(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * The value in force for a knob: the override if one is set, else the default
 * the declaration carries. An unknown id returns undefined rather than throwing
 * — a knob can be deleted from source while a stale preset still names it.
 */
export function tuneValue(id: string): TuneValue | undefined {
  if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id]
  return getTunable(id)?.value
}

/** The overrides only — what a preset is, and what gets written to source. */
export function tuneOverrides(): TuneOverrides {
  return { ...overrides }
}

export function isTuned(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id)
}

export function setTuneValue(id: string, value: TuneValue) {
  overrides = { ...overrides, [id]: value }
  persistSession()
  notify()
}

export function resetTuneValue(id: string) {
  if (!isTuned(id)) return
  const next = { ...overrides }
  delete next[id]
  overrides = next
  persistSession()
  notify()
}

/** Drop a set of ids at once — what a successful write-to-source does. */
export function resetTuneValues(ids: string[]) {
  const next = { ...overrides }
  let changed = false
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(next, id)) {
      delete next[id]
      changed = true
    }
  }
  if (!changed) return
  overrides = next
  persistSession()
  notify()
}

export function resetAllTuneValues() {
  if (Object.keys(overrides).length === 0) return
  overrides = {}
  persistSession()
  notify()
}

/** Replace the whole override set — applying a preset, or a decoded URL. */
export function applyTuneOverrides(next: TuneOverrides, persist = true) {
  overrides = { ...next }
  if (persist) persistSession()
  notify()
}

function persistSession() {
  if (!TUNE_ENABLED) return
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(SESSION_KEY)
    } else {
      localStorage.setItem(SESSION_KEY, JSON.stringify(overrides))
    }
  } catch {
    // Private-mode or quota. Tuning still works for this page view.
  }
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Presets saved in this browser. Repo presets (`presets.ts`, committed, shared)
 * are merged over these by the panel; this store keeps only the local ones so
 * the hydration below stays synchronous and prod-safe.
 */
export function localPresets(): TunePresets {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    return raw ? (JSON.parse(raw) as TunePresets) : {}
  } catch {
    return {}
  }
}

export function saveLocalPreset(name: string, values: TuneOverrides) {
  const next = { ...localPresets(), [name]: values }
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function deleteLocalPreset(name: string) {
  const next = localPresets()
  delete next[name]
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/* URL form                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Two URL forms, because they answer different needs:
 *
 *   `#tune=warm`   — a named preset, resolved against this browser's presets
 *                    and the committed ones. Short, readable, what you type.
 *   `#tune=~<b64>` — the values themselves, base64url-encoded JSON. Long and
 *                    self-contained, which is what a screenshot rig or another
 *                    machine needs, since it carries no localStorage of yours.
 *
 * `shoot.mjs` uses either: a named preset once the preset is committed to
 * `presets.ts`, the inline form for a tuning that only exists in your tab.
 */
export function encodeTuneState(values: TuneOverrides): string {
  const json = JSON.stringify(values)
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
  return '~' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeTuneState(encoded: string): TuneOverrides | null {
  try {
    const b64 = encoded.slice(1).replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as TuneOverrides
  } catch {
    return null
  }
}

/** The `tune=` value of the current URL hash, or null. */
export function readTuneHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const value = params.get('tune')
  return value && value.trim() ? value.trim() : null
}

/**
 * The preset the page was opened on. The panel stays closed *and* hides its
 * handle when this is set: a page opened on `#tune=warm` is a page being
 * photographed, and a tuning handle in the corner of every shot is a bug in the
 * rig, not a feature of the tool.
 */
export function urlPresetName(): string | null {
  return urlPreset
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Hydrate before first paint: the URL wins, then this browser's session, then
 * nothing. Synchronous and at module scope so page code reading a runtime knob
 * on its first render already sees the tuned value — no flash of the default,
 * and no screenshot taken during one.
 *
 * A named preset that is only in `presets.ts` cannot be resolved here (that
 * module is dev-only); the panel re-resolves it on mount, which is a repaint
 * rather than a flash of untuned content, because the CSS overlay lands in the
 * same tick as the panel.
 */
/**
 * Read the URL and apply what it names. Returns the preset name it could not
 * resolve, so a caller with more presets to hand (the panel, which can see the
 * committed ones) can finish the job.
 *
 * Also called on `hashchange`, because editing `#tune=` in the address bar is
 * how two tunings get compared, and a hash-only navigation does not reload the
 * document — without this the URL would change and the page would not.
 */
export function hydrateFromUrl(): string | null {
  const hash = readTuneHash()
  const was = urlPreset
  if (!hash) {
    urlPreset = null
    // Deleting `#tune=…` from the address bar is how the handle comes back.
    if (was !== null) notify()
    return null
  }
  urlPreset = hash.startsWith('~') ? '(url)' : hash
  const values = hash.startsWith('~')
    ? decodeTuneState(hash)
    : (localPresets()[hash] ?? null)
  if (values) {
    applyTuneOverrides(values, false)
    return null
  }
  notify() // the handle hides on a preset URL even before the values resolve
  return hash.startsWith('~') ? null : hash
}

if (TUNE_ENABLED) {
  if (readTuneHash()) {
    hydrateFromUrl()
  } else {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) overrides = JSON.parse(raw) as TuneOverrides
    } catch {
      overrides = {}
    }
  }
}
