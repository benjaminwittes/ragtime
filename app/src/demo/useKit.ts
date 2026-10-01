import { useEffect, useState } from 'react'

import { toHref } from '@/lib/routing'

import { openKit, passphraseIn, type Kit, type SealedKit } from './kit.ts'

/** Where the sealed kit is served. Not under `/demo`, so the file and the route never contend for one path. */
const KIT_PATH = '/kits/demo.sealed.json'

/** The passphrase, once a link has delivered it, so the second visit needs no link. */
const KEPT = 'ragtime_demo_kit_key_v1'

function kept(): string | null {
  try {
    return window.localStorage.getItem(KEPT)
  } catch {
    return null
  }
}

function keep(passphrase: string | null) {
  try {
    if (passphrase === null) window.localStorage.removeItem(KEPT)
    else window.localStorage.setItem(KEPT, passphrase)
  } catch {
    /* a browser that refuses storage just asks again next time */
  }
}

/** The sealed file as served, or null when there is none. Never from cache: a re-sealed kit is a different kit. */
export async function fetchSealed(): Promise<SealedKit | null> {
  try {
    const response = await fetch(toHref(KIT_PATH), { cache: 'no-cache' })
    if (!response.ok) return null
    return (await response.json()) as SealedKit
  } catch {
    return null
  }
}

/**
 * Open the kit with the passphrase this device already holds, if it holds one that works.
 * For the places that must not ask: a presenter's tab picking up where it was after a
 * reload has no form to show and no moment to show it in.
 */
export async function openKept(): Promise<{ kit: Kit; sealed: SealedKit } | null> {
  const passphrase = kept()
  if (passphrase === null) return null
  const sealed = await fetchSealed()
  if (!sealed) return null
  const opened = await openKit(sealed, passphrase)
  return opened.ok ? { kit: opened.kit, sealed } : null
}

export type KitState =
  | { at: 'loading' }
  | { at: 'missing' }
  | { at: 'locked'; sealed: SealedKit; why: 'wrong' | 'unreadable' | null }
  | { at: 'open'; kit: Kit; sealed: SealedKit }

/**
 * The kit, from sealed file to open, for a page that shows it.
 *
 * The passphrase arrives in the link's fragment (`#k=…`), is taken out of the address bar
 * the moment it is read, and is kept on the device instead. That is not tidiness. These
 * pages are shown on a shared screen, with the address bar in view, and a passphrase left
 * there would be handed to the room.
 */
export function useKit(): {
  state: KitState
  tryPassphrase: (passphrase: string) => Promise<void>
  forget: () => void
} {
  const [state, setState] = useState<KitState>({ at: 'loading' })
  // Read once, into state, and not inside the effect that strips it: StrictMode runs an
  // effect twice in development, and the second run would find the fragment already gone
  // and conclude that no link had been followed.
  const [fromLink] = useState(() => passphraseIn(window.location.hash))

  useEffect(() => {
    let cancelled = false
    if (fromLink !== null && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    ;(async () => {
      const sealed = await fetchSealed()
      if (cancelled) return
      if (!sealed) {
        setState({ at: 'missing' })
        return
      }
      const passphrase = fromLink ?? kept()
      if (passphrase === null) {
        setState({ at: 'locked', sealed, why: null })
        return
      }
      const opened = await openKit(sealed, passphrase)
      if (cancelled) return
      if (opened.ok) {
        keep(passphrase)
        setState({ at: 'open', kit: opened.kit, sealed })
      } else {
        // A kept passphrase that no longer opens the kit means the kit was re-sealed
        // with a new one; forget it, so the page asks rather than failing forever.
        if (fromLink === null) keep(null)
        setState({ at: 'locked', sealed, why: fromLink === null ? null : opened.why })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fromLink])

  async function tryPassphrase(passphrase: string) {
    if (state.at !== 'locked') return
    const { sealed } = state
    const opened = await openKit(sealed, passphrase.trim())
    if (opened.ok) {
      keep(passphrase.trim())
      setState({ at: 'open', kit: opened.kit, sealed })
    } else {
      setState({ at: 'locked', sealed, why: opened.why })
    }
  }

  function forget() {
    keep(null)
    window.location.reload()
  }

  return { state, tryPassphrase, forget }
}
