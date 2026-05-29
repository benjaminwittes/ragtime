/**
 * Pre-flight skip preference (PR 4w).
 *
 * Stores a per-browser flag in localStorage. When set, the AMA pre-flight
 * modal is skipped and the synthesis call fires immediately after planning.
 * Default is unset (= modal fires on every query); the user can opt out
 * via the modal's "Don't show this again" checkbox and opt back in via
 * the AccessSettings dropdown.
 *
 * Brief #1 §4b auditability + Ben's testing note (2026-05-29): the modal
 * exists to make cost visible BEFORE spending. PR 4v–4w drops the
 * 25¢-threshold gate so every query shows the estimate; the skip
 * preference is the expert-user escape hatch.
 */

const KEY = 'ragtime_ama_preflight_skip'

export function isAmaPreflightSkipped(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    // localStorage can throw in privacy mode / iframes without access.
    // Default to showing the modal — safer for cost transparency.
    return false
  }
}

export function setAmaPreflightSkipped(skip: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (skip) {
      window.localStorage.setItem(KEY, 'true')
    } else {
      window.localStorage.removeItem(KEY)
    }
    // Fire a custom event so listeners (the AccessSettings toggle) can
    // refresh without polling.
    window.dispatchEvent(new CustomEvent('ragtime:ama-preflight-skip-changed'))
  } catch {
    // No-op in restricted environments.
  }
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeAmaPreflightSkip(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener('ragtime:ama-preflight-skip-changed', handler)
  // Also catch cross-tab changes via the storage event.
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb()
  }
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener('ragtime:ama-preflight-skip-changed', handler)
    window.removeEventListener('storage', storageHandler)
  }
}
