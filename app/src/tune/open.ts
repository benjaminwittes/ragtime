import { useSyncExternalStore } from 'react'

/**
 * Whether the panel is open, as one fact the panel, the gear in the site bar and the keyboard
 * all share. The panel is a tuner's tool and a reader's settings at once (`Panel.tsx`), and
 * whichever is mounted reads this.
 */

let open = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (next === open) return
  open = next
  for (const fn of listeners) fn()
}

export const setPanelOpen = (next: boolean) => set(next)
export const togglePanel = () => set(!open)
export const panelIsOpen = () => open

export function usePanelOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    panelIsOpen,
    panelIsOpen,
  )
}
