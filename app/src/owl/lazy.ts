import { useEffect, useReducer } from 'react'

/**
 * A module the owl fetches the first time a design asks for it, and keeps.
 *
 * The owl as sent is itself one of these: the line-tile style, the standing behaviours and the
 * voice are each a chunk of their own, and the main chunk holds only an empty box to draw in
 * until they arrive. A design that names one draws what it can
 * without it until it arrives, and the caller re-renders when it does. Nothing here throws a
 * promise at React, so no boundary can blank a region while a chunk is on its way.
 */
export type Lazy<T> = {
  /** The module, if it has arrived. Never starts a fetch, so it is safe to call while rendering. */
  get(): T | undefined
  /**
   * Fetch it, once; asking again while it is on its way returns the same promise. A fetch
   * that failed (offline, a deploy that replaced the file) is forgotten, so the next ask tries again.
   */
  load(): Promise<T>
  /** For code that already has the module in hand: the lab, which loads everything, and the tests. */
  provide(value: T): void
}

export function lazy<T>(fetch: () => Promise<T>): Lazy<T> {
  let value: T | undefined
  let pending: Promise<T> | undefined
  return {
    get: () => value,
    load() {
      if (value !== undefined) return Promise.resolve(value)
      pending ??= fetch().then(
        (loaded) => {
          value = loaded
          return loaded
        },
        (error: unknown) => {
          pending = undefined
          throw error
        },
      )
      return pending
    },
    provide(next) {
      value = next
    },
  }
}

/**
 * The module in `slot` once it has arrived, and `undefined` until then or when there is no
 * slot (nothing asked for one). Asking starts the fetch; arriving re-renders the caller.
 * A module that is already here is returned on the first render, so a second owl that wants
 * the same thing never draws without it.
 */
export function useLazy<T>(slot: Lazy<T> | null | undefined): T | undefined {
  const [, arrived] = useReducer((n: number) => n + 1, 0)
  const value = slot?.get()
  useEffect(() => {
    if (!slot) return
    if (slot.get() !== undefined) {
      // It landed between this render and this effect, by way of another owl.
      if (value === undefined) arrived()
      return
    }
    let live = true
    slot.load().then(
      () => {
        if (live) arrived()
      },
      // Offline or a stale chunk: stay with the fallback. The next owl to mount asks again.
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [slot, value])
  return value
}
