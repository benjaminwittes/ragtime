/**
 * `useTunable` — how page code reads a runtime knob.
 *
 * The contract that makes this safe to put in shipping code: with no panel
 * mounted it returns the declared default and never re-renders, because the
 * store holds no overrides and fires no events. In a production build the
 * subscription is a no-op registration and the value is a constant. So a page
 * can read `useTunable('hub.previewRows')` in the same breath it would have
 * written `25`, and the number in the declaration is the number that ships.
 *
 * Token knobs need none of this — a CSS custom property is already live, and
 * the overlay moves it without React knowing. Reach for `useTunable` only for a
 * parameter the page computes with.
 */

import { useSyncExternalStore } from 'react'
import { getTunable } from './registry'
import { subscribeTune, tuneValue } from './store'
import type { TuneValue } from './types'

/**
 * The value in force for `id`.
 *
 * The type parameter is an assertion, not a check: the declaration is the
 * source of truth for a knob's type, and reading `hub.previewRows` as a number
 * is right because its declaration says `value: 25`. A missing id throws in
 * dev (a typo'd knob would otherwise read as `undefined` and quietly change
 * behaviour) and falls back to `undefined` in production.
 */
export function useTunable<T extends TuneValue>(id: string): T {
  const read = () => {
    const value = tuneValue(id)
    if (value === undefined && import.meta.env.DEV && !getTunable(id)) {
      throw new Error(`[tune] no tunable declared with id: ${id}`)
    }
    return value as T
  }
  return useSyncExternalStore(subscribeTune, read, read)
}
