/**
 * What a presenter says to the stage, and how the stage decides whether to believe it.
 *
 * `/stage` is where an audience sits; `/present` is where a presenter drives it. Between
 * them is a broadcast channel that anyone can send on (`transport.ts`): this app is a
 * static site with a public key to a public channel, and there is no server to ask "is
 * this the presenter?". So the answer is in the message. Whoever seals a presenter's kit
 * (`scripts/seal-kit.mjs`) also makes a signing key; the private half goes inside the
 * sealed kit, where only the passphrase reaches it, and the public half is served beside
 * it in the clear. A presenter signs everything they send, and a stage draws nothing it
 * cannot verify. The passphrase that opens the kit is therefore also what lets someone
 * present, and nothing else does.
 *
 * Everything here is pure or takes its crypto as an argument, so the rules are tested in
 * node (`protocol.test.ts`) without a browser or a network.
 */

import type { RecordScene } from './record.ts'

/** A deck slide, as the audience sees it. The presenter's notes are never in one. */
export type SlideScene = {
  kind: 'slide'
  /** Zero-based, with the count beside it: the audience has no deck to count. */
  at: number
  of: number
  part: string
  title: string
  body: string
}

/** A figure this build knows by name (`figures.tsx`), drawn live in each reader's browser. */
export type FigureScene = { kind: 'figure'; name: string }

/** A search, brought on as objects (`record.ts`). The documents travel with it: a stage asks the service for nothing. */
export type { RecordScene } from './record.ts'

/** The presenter's own page of the app. The picture arrives separately, as frames. */
export type MirrorScene = { kind: 'mirror' }

export type Scene = SlideScene | FigureScene | MirrorScene | RecordScene

/** On every signed message: who sent it, its place in their sequence, and when. */
type Stamp = { v: 1; sid: string; n: number; t: number }

/** What is on stage. Small, and sent again whenever someone arrives and asks. */
export type StateMsg = Stamp & {
  kind: 'state'
  /** The presenter's name, if they gave one. Shown to other presenters, not the room. */
  who: string
  /** When this presenter went live. Whoever did so most recently holds the stage. */
  since: number
  scene: Scene
  /** The nonces of the `hello`s this answers, if it answers any. See {@link accept}. */
  re?: string[]
}

/**
 * "Still here." Carries no content, so it can be frequent — only the numbers of the state
 * and the frame now on stage, so a reader who missed either can tell, and ask.
 */
export type BeatMsg = Stamp & { kind: 'beat'; on: number; frame: number | null }

/** One picture of the presenter's page (`mirror.ts`). */
export type FrameMsg = Stamp & {
  kind: 'frame'
  /** The logical path the presenter is on, for the stage's caption. */
  path: string
  /** The page's markup, packed (`pack`). */
  html: string
  /** The root element's class and custom properties, which the markup inherits from. */
  cls: string
  vars: Record<string, string>
  /** How far down the window is, as a fraction; an element's own scroll is in the markup. */
  y: number
  re?: string[]
}

/** A scroll, by itself: the common change, and far too small to send a frame for. */
export type ScrollMsg = Stamp & { kind: 'scroll'; at: number[]; y: number }

/** Where the presenter is pointing, as a place inside an element, or nowhere. */
export type PointMsg = Stamp & { kind: 'point'; at: number[] | null; x: number; y: number }

/** Which object the presenter has brought forward in a record scene, or none. */
export type FocusMsg = Stamp & { kind: 'focus'; id: string | null }

/** "I have stopped." So the stage goes quiet now, not when the beats run out. */
export type ByeMsg = Stamp & { kind: 'bye' }

export type Msg = StateMsg | BeatMsg | FrameMsg | ScrollMsg | PointMsg | FocusMsg | ByeMsg

/** A message as signed: the exact text that was signed, and the signature over it. */
export type Signed = { p: string; s: string }

/**
 * What crosses the channel. A signed message whole, a piece of one too large to send
 * whole, or the one thing an audience says: "I have just arrived, what is on?"
 */
export type Wire =
  | { m: Signed }
  | { c: string; i: number; of: number; d: string }
  | { hello: string }

/**
 * A stage with no beat for this long is quiet.
 *
 * Long, and on purpose. A presenter who stops says so (`bye`), and the stage goes quiet at
 * once; this is only for the presenter who vanishes — a closed lid, a dead battery. It
 * cannot be short, because a presenter who has switched to another application is not
 * gone: a browser slows a hidden tab's timers, to as little as one a minute, and a stage
 * that went dark whenever the presenter showed the room something else would be worse
 * than one that holds the last slide a minute too long.
 */
export const QUIET_AFTER_MS = 90_000
export const BEAT_EVERY_MS = 4_000

/**
 * How far a message's clock may be from ours. Generous, because the cost of a replay
 * inside the window is a slide shown twice, and the cost of refusing a presenter whose
 * laptop is a minute out is an empty stage in front of a room.
 */
export const MAX_SKEW_MS = 90_000

/** Above this a signed message is sent in pieces. Well under what the channel carries. */
export const PIECE_CHARS = 120_000

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

function b64(bytes: Uint8Array): string {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(raw)
}

function unb64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** A new signing pair, as the two JWKs the kit carries. Used by the seal script and the tests. */
export async function newStageKeys(
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<{ key: JsonWebKey; pub: JsonWebKey }> {
  const pair = await subtle.generateKey(ECDSA, true, ['sign', 'verify'])
  return { key: await subtle.exportKey('jwk', pair.privateKey), pub: await subtle.exportKey('jwk', pair.publicKey) }
}

export function signingKey(jwk: JsonWebKey, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<CryptoKey> {
  return subtle.importKey('jwk', jwk, ECDSA, false, ['sign'])
}

export function verifyingKey(jwk: JsonWebKey, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<CryptoKey> {
  // Only the public coordinates are read. A file that carried a private `d` here by
  // mistake would otherwise import as a private key and then refuse to verify.
  const { kty, crv, x, y } = jwk
  return subtle.importKey('jwk', { kty, crv, x, y }, ECDSA, false, ['verify'])
}

/**
 * Which stage a key speaks to: a short name made from the public key. A kit sealed again
 * with a new key is a new stage, so nobody still holding the old one can be heard on it.
 */
export async function stageName(pub: JsonWebKey, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`${pub.x}.${pub.y}`))
  return [...new Uint8Array(digest).subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sign(msg: Msg, key: CryptoKey, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<Signed> {
  const p = JSON.stringify(msg)
  const s = await subtle.sign(SIGN, key, new TextEncoder().encode(p))
  return { p, s: b64(new Uint8Array(s)) }
}

/** The message, if the signature is the presenter's and the text is a message. Otherwise null. */
export async function verify(
  signed: Signed,
  key: CryptoKey,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<Msg | null> {
  try {
    if (typeof signed.p !== 'string' || typeof signed.s !== 'string') return null
    const ok = await subtle.verify(SIGN, key, unb64(signed.s), new TextEncoder().encode(signed.p))
    if (!ok) return null
    const msg = JSON.parse(signed.p) as Msg
    if (msg.v !== 1 || typeof msg.sid !== 'string' || !Number.isFinite(msg.n) || !Number.isFinite(msg.t)) return null
    return msg
  } catch {
    return null
  }
}

/** A signed message as what is actually sent: itself, or pieces of itself. */
export function toWire(signed: Signed, id: string, size = PIECE_CHARS): Wire[] {
  const whole = JSON.stringify(signed)
  if (whole.length <= size) return [{ m: signed }]
  const of = Math.ceil(whole.length / size)
  return Array.from({ length: of }, (_, i) => ({ c: id, i, of, d: whole.slice(i * size, (i + 1) * size) }))
}

/**
 * Puts pieces back together. The same message can arrive twice — the channel has a local
 * leg and a network leg — so a message already completed is not completed again, and a
 * half-built one that never finishes is dropped when newer ones crowd it out.
 */
export function joiner(keep = 6): (wire: Wire) => Signed | null {
  const partial = new Map<string, { got: (string | undefined)[]; left: number }>()
  const done: string[] = []
  return (wire) => {
    // The channel is open to anyone, so what arrives may be anything at all.
    if (typeof wire !== 'object' || wire === null) return null
    if ('m' in wire) return typeof wire.m === 'object' && wire.m !== null ? wire.m : null
    if (!('c' in wire)) return null
    const { c, i, of, d } = wire
    if (typeof c !== 'string' || typeof d !== 'string') return null
    if (done.includes(c) || !Number.isInteger(of) || of < 1 || of > 400 || !Number.isInteger(i) || i < 0 || i >= of) return null
    let entry = partial.get(c)
    if (!entry) {
      entry = { got: new Array<string | undefined>(of), left: of }
      partial.set(c, entry)
      // Oldest first out: a Map keeps insertion order.
      while (partial.size > keep) partial.delete(partial.keys().next().value as string)
    }
    if (entry.got.length !== of || entry.got[i] !== undefined) return null
    entry.got[i] = d
    entry.left -= 1
    if (entry.left > 0) return null
    partial.delete(c)
    done.push(c)
    if (done.length > keep * 4) done.shift()
    try {
      const whole: unknown = JSON.parse(entry.got.join(''))
      return typeof whole === 'object' && whole !== null ? (whole as Signed) : null
    } catch {
      return null
    }
  }
}

/** Text → gzip → base64, where the browser can; the text itself, marked, where it cannot. */
export async function pack(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return 'r:' + text
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return 'z:' + b64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function unpack(packed: string): Promise<string> {
  if (packed.startsWith('r:')) return packed.slice(2)
  const stream = new Blob([unb64(packed.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

/** Everything a stage knows about who is presenting, and what. */
export type Following = {
  /** The presenter being followed, if there is one, and when they went live, on this clock. */
  holder: { sid: string; who: string; since: number } | null
  /** When the holder was last heard, on this clock. */
  heard: number
  state: StateMsg | null
  frame: FrameMsg | null
  scroll: ScrollMsg | null
  point: PointMsg | null
  /** The object brought forward in a record scene. */
  focus: string | null
  /** The highest sequence number taken from each sender: a message is used once. */
  seen: Record<string, number>
  /** How far each sender's clock is from this one, where a `hello` has measured it. */
  skew: Record<string, number>
}

export const NOBODY: Following = {
  holder: null,
  heard: 0,
  state: null,
  frame: null,
  scroll: null,
  point: null,
  focus: null,
  seen: {},
  skew: {},
}

export function isLive(following: Following, now: number): boolean {
  return following.holder !== null && now - following.heard < QUIET_AFTER_MS
}

/**
 * Take one verified message into account. Returns what is now being followed, or the
 * same object when the message changes nothing — it was a replay, it was stale, or it
 * came from someone who is not the presenter in control.
 *
 * **Fresh.** A signature proves who wrote a message, not when: a recording of yesterday's
 * presentation would verify just as well. So a message must also be recent by its own
 * stamp, within {@link MAX_SKEW_MS}. A reader whose clock is wrong would then never see a
 * stage at all, so there is a second way to be believed: a message that answers this
 * reader's own `hello`, by quoting the nonce it carried, cannot have been recorded
 * earlier — and it measures the sender's clock against ours for everything after it.
 *
 * **Once.** Each sender numbers what they send, and a number is used once.
 *
 * **One presenter.** Whoever went live most recently holds the stage, and everything from
 * anyone else is ignored. "Went live", not "spoke last": a presenter who has just been
 * superseded may still answer a `hello` before they hear of it, and that answer must not
 * take the stage back.
 */
export function accept(following: Following, msg: Msg, now: number, nonce: string | null): Following {
  const answered = nonce !== null && 're' in msg && Array.isArray(msg.re) && msg.re.includes(nonce)
  const skew = answered ? now - msg.t : (following.skew[msg.sid] ?? 0)
  if (!answered && Math.abs(msg.t + skew - now) > MAX_SKEW_MS) return following
  if (msg.n <= (following.seen[msg.sid] ?? -1)) return following

  const seen = { ...following.seen, [msg.sid]: msg.n }
  const skews = answered ? { ...following.skew, [msg.sid]: skew } : following.skew
  const noted: Following = { ...following, seen, skew: skews }
  const holds = following.holder?.sid === msg.sid

  if (msg.kind === 'state') {
    // Two presenters' clocks are compared here, and that is as good as "most recent" gets.
    const since = msg.since + skew
    if (!holds && following.holder && isLive(following, now) && since <= following.holder.since) return noted
    return {
      ...noted,
      holder: { sid: msg.sid, who: msg.who, since },
      heard: now,
      state: msg,
      // A different presenter's page is not this presenter's page.
      frame: holds ? following.frame : null,
      scroll: holds ? following.scroll : null,
      point: holds ? following.point : null,
      // Brought forward in the scene that was up; a new scene starts with nothing forward.
      focus: null,
    }
  }
  if (!holds) return noted
  if (msg.kind === 'bye') return { ...noted, holder: null, state: null, frame: null, scroll: null, point: null, focus: null }
  if (msg.kind === 'focus') return { ...noted, heard: now, focus: msg.id }
  if (msg.kind === 'beat') return { ...noted, heard: now }
  if (msg.kind === 'frame') return { ...noted, heard: now, frame: msg, scroll: null }
  if (msg.kind === 'scroll') return { ...noted, heard: now, scroll: msg }
  return { ...noted, heard: now, point: msg }
}

/** A short random name: a presenter's session, a message's pieces, a reader's nonce. */
export function token(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(9))
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_')
}
