import { joiner, stageName, token, toWire, verify, verifyingKey, type Msg, type Signed, type Wire } from './protocol.ts'
import { openTransport, type Transport } from './transport.ts'

/**
 * One tab's connection to one stage, shared by everything in the tab that wants it.
 *
 * Shared because a tab can hold two parties at once — a presenter who opens `/stage` in
 * the tab they are presenting from is both — and a channel can be joined once per client.
 * So the connection is opened by whoever asks first, counted, and closed when the last
 * listener lets go.
 *
 * This is also where a signature is checked, once, for every listener: what a listener is
 * handed is a message the kit's key signed. Checking takes a moment and messages must
 * stay in order — a frame overtaking the scroll that followed it would put the page in
 * the wrong place — so arrivals wait in line for each other.
 */
export type Listener = {
  /** A verified message from a presenter. */
  onMsg?: (msg: Msg) => void
  /** Someone has just arrived and is asking what is on. Unsigned: anyone may ask. */
  onHello?: (nonce: string) => void
  onAudience?: (count: number) => void
  /** The network leg is up, or back. */
  onJoined?: () => void
}

export type Link = {
  /** Listen. Returns the way to stop; the connection closes when nobody is left. */
  add: (listener: Listener) => () => void
  send: (signed: Signed) => void
  hello: (nonce: string) => void
  /** Be counted as audience. */
  attend: () => void
}

const links = new Map<string, { link: Link; count: number; transport: Transport }>()

export async function openLink(pub: JsonWebKey): Promise<Link> {
  const name = await stageName(pub)
  const existing = links.get(name)
  if (existing) return existing.link

  const key = await verifyingKey(pub)
  // Two callers can both get past the check above while the key is being imported.
  const raced = links.get(name)
  if (raced) return raced.link

  const listeners = new Set<Listener>()
  const join = joiner()
  let line: Promise<void> = Promise.resolve()

  const transport = openTransport(name, {
    onWire(wire: Wire) {
      if (typeof wire !== 'object' || wire === null) return
      if ('hello' in wire) {
        if (typeof wire.hello === 'string' && wire.hello.length <= 64) {
          for (const listener of listeners) listener.onHello?.(wire.hello)
        }
        return
      }
      const signed = join(wire)
      if (!signed) return
      line = line.then(async () => {
        const msg = await verify(signed, key)
        if (msg) for (const listener of listeners) listener.onMsg?.(msg)
      })
    },
    onAudience(count) {
      for (const listener of listeners) listener.onAudience?.(count)
    },
    onJoined() {
      for (const listener of listeners) listener.onJoined?.()
    },
  })

  const entry = {
    count: 0,
    transport,
    link: {
      add(listener: Listener) {
        listeners.add(listener)
        entry.count += 1
        let gone = false
        return () => {
          if (gone) return
          gone = true
          listeners.delete(listener)
          entry.count -= 1
          // Not at once: StrictMode unmounts and remounts an effect in the same tick, and
          // a route change hands the connection from one page to the next. Closing and
          // reopening the channel for either would drop whatever arrived in between.
          window.setTimeout(() => {
            if (entry.count === 0 && links.get(name) === entry) {
              links.delete(name)
              transport.close()
            }
          }, 1_000)
        }
      },
      send(signed: Signed) {
        for (const wire of toWire(signed, token())) transport.send(wire)
        // Neither leg echoes to its sender, and a presenter who opens the stage in the
        // tab they are presenting from should see it. Through the same line, so it keeps
        // its place among what arrives.
        line = line.then(() => {
          const msg = JSON.parse(signed.p) as Msg
          for (const listener of listeners) listener.onMsg?.(msg)
        })
      },
      hello(nonce: string) {
        transport.send({ hello: nonce })
        for (const listener of listeners) listener.onHello?.(nonce)
      },
      attend() {
        transport.attend()
      },
    } satisfies Link,
  }
  links.set(name, entry)
  return entry.link
}
