/**
 * Opening a sealed presenter's kit (`scripts/seal-kit.mjs` seals one, and says
 * why it exists: a static app in a public repo has nowhere private to keep a
 * page, so the page is shipped as ciphertext and opened in the browser).
 *
 * Everything here is pure or takes its I/O as an argument, so the format is
 * tested in node against the script that writes it (`kit.test.ts`).
 */

/** One slide: a title, markdown under it, and what the presenter says. */
export type Slide = {
  /** The section it belongs to ("Part I"), or empty. */
  part: string
  title: string
  body: string
  /** Shown only to the presenter. */
  notes: string
}

export type Kit = {
  title: string
  when: string
  /** The presenter's guide, markdown. */
  guide: string
  slides: Slide[]
  /**
   * The key a presenter signs with when they drive `/stage` (`src/stage/protocol.ts`).
   * Inside the seal, so the passphrase that opens the kit is what lets someone present.
   * Absent from a kit sealed before the stage existed.
   */
  stage?: { key: JsonWebKey }
}

/** The file as served. The numbers are the script's; this only reads them. */
export type SealedKit = {
  v: number
  kdf: string
  cipher: string
  iterations: number
  salt: string
  iv: string
  data: string
  /**
   * The public half of the kit's signing key, in the clear: it is what the audience's
   * browsers check a presenter against, and they have no passphrase.
   */
  stage?: { pub: JsonWebKey }
}

/**
 * What came of trying to open one. `wrong` covers a wrong passphrase and a
 * tampered file alike: AES-GCM cannot tell them apart, and a reader cannot act
 * on the difference.
 */
export type Opened = { ok: true; kit: Kit } | { ok: false; why: 'wrong' | 'unreadable' }

function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export async function openKit(
  sealed: SealedKit,
  passphrase: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<Opened> {
  // A format this build does not know is not a wrong passphrase, and saying
  // "wrong" would send a presenter hunting for a typo that is not there.
  if (sealed.v !== 1 || sealed.kdf !== 'PBKDF2-SHA-256' || sealed.cipher !== 'AES-256-GCM') {
    return { ok: false, why: 'unreadable' }
  }
  let plain: ArrayBuffer
  try {
    const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(sealed.salt), iterations: sealed.iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, key, bytes(sealed.data))
  } catch {
    return { ok: false, why: 'wrong' }
  }
  try {
    const kit = JSON.parse(new TextDecoder().decode(plain)) as Kit
    if (typeof kit.guide !== 'string' || !Array.isArray(kit.slides)) return { ok: false, why: 'unreadable' }
    return { ok: true, kit }
  } catch {
    return { ok: false, why: 'unreadable' }
  }
}

/**
 * The passphrase a link carries: `#k=<passphrase>`. In the fragment and not
 * the query on purpose — a fragment is never sent to a server, never lands in
 * an access log, and is not forwarded in a `Referer`.
 */
export function passphraseIn(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('k')
  return value && value.trim() ? value.trim() : null
}

/** Which of the kit's two faces a path names. */
export type DemoView = 'guide' | 'deck'

export function demoView(pathname: string): DemoView | null {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/demo') return 'guide'
  if (path === '/demo/deck') return 'deck'
  return null
}

/**
 * Where a key press takes the deck. Clamped rather than wrapping: a presenter
 * who presses → on the last slide wants to still be on the last slide, not
 * back at the title in front of a room.
 */
export function slideAfter(key: string, at: number, count: number): number {
  const last = Math.max(0, count - 1)
  if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Enter') return Math.min(last, at + 1)
  if (key === 'ArrowLeft' || key === 'PageUp' || key === 'Backspace') return Math.max(0, at - 1)
  if (key === 'Home') return 0
  if (key === 'End') return last
  return at
}
