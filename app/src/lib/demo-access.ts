import { useSyncExternalStore } from 'react'

/**
 * TEMPORARY demo-password access (pre-launch).
 *
 * Re-adds the legacy single-file app's "Lawfare demo password" path to the
 * React app for product demos. A shared password unlocks the Worker's demo
 * auth mode: Lawfare-billed Anthropic, Anthropic-only, a shared 500-request/
 * day quota, no per-user balance. The Worker still fully supports this
 * (`resolveCorpusAuth` reads `body.password`); only the frontend affordance
 * was dropped in the React rebuild.
 *
 * This is a stopgap for demoing the beta, NOT a launch tier — the launch
 * tiers are paid (Stripe-prepaid) + BYOK. To remove it, delete this module,
 * the Demo tab in AccessSettings, and the `demo` arm of AuthArg / useAuth.
 *
 * Storage: localStorage `ragtime_demo_pw` (plaintext, same posture as BYOK).
 */

const KEY = 'ragtime_demo_pw'
const EVENT = 'ragtime:demo-password-changed'

export function getDemoPassword(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function setDemoPassword(pw: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (pw && pw.length > 0) {
      window.localStorage.setItem(KEY, pw)
    } else {
      window.localStorage.removeItem(KEY)
    }
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    // No-op in restricted environments (private mode / sandboxed iframe).
  }
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb()
  }
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', storageHandler)
  }
}

/** Reactive read of the current demo password (null when unset). */
export function useDemoPassword(): string | null {
  return useSyncExternalStore(subscribe, getDemoPassword, () => null)
}
