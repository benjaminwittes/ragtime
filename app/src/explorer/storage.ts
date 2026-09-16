/**
 * localStorage, with the three ways it fails already handled.
 *
 * It throws on access in some privacy modes, it throws `QuotaExceededError` on write when
 * the origin is full, and it does not exist during a server render. None of those is a
 * reason to take the page down: a conversation that cannot be saved is a conversation the
 * reader still wants to be having. So every call here is best-effort and silent, and the
 * caller treats "not saved" as ordinary rather than exceptional.
 */

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** True when it actually landed — the caller may want to know it did not. */
export function writeLocal(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to do about it, and nothing depends on it */
  }
}
