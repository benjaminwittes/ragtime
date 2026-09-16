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

/**
 * Every key under a prefix. What makes the conversation index a cache rather than a
 * record: the blobs can be enumerated, so an index that is lost, half-written or out of
 * step with them can be rebuilt from what is actually there.
 */
export function keysLocal(prefix: string): string[] {
  try {
    const out: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) out.push(k)
    }
    return out
  } catch {
    return []
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to do about it, and nothing depends on it */
  }
}
