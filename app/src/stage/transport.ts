import type { RealtimeChannel } from '@supabase/supabase-js'

import { getSupabase } from '@/auth/supabase'

import type { Wire } from './protocol.ts'

/**
 * The channel between a presenter and the stage. Two legs, one message format.
 *
 * **The local leg** is a `BroadcastChannel`: every tab of this site in this browser, with
 * no network at all. It is what makes a presenter's own second window — the one on the
 * projector — follow instantly, and keep following if the venue's connection drops.
 *
 * **The network leg** is a Realtime broadcast channel on the project this app already
 * signs people in with. It needs no table, no policy and no server of ours: a broadcast
 * is relayed to whoever is on the channel and stored nowhere. Anyone can join and anyone
 * can send, which is why nothing is believed unless it is signed (`protocol.ts`).
 *
 * A message can arrive on both legs. The protocol's own rule — a sequence number is used
 * once — is what makes that harmless, so nothing here tries to tell them apart.
 */
export type Transport = {
  send: (wire: Wire) => void
  /** Be counted as audience from now on. A presenter is not counted. */
  attend: () => void
  close: () => void
}

export type TransportOptions = {
  onWire: (wire: Wire) => void
  /** Called when the network leg is up, and again each time it comes back. */
  onJoined?: () => void
  /** How many people are on the channel as audience. Presence, so it is approximate. */
  onAudience?: (count: number) => void
}

/** A stage's channel is its key's name and this site's host: a dev server is not the room. */
export function channelName(stage: string): string {
  return `stage:${stage}:${window.location.host}`
}

export function openTransport(stage: string, options: TransportOptions): Transport {
  const name = channelName(stage)
  let closed = false

  let local: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    local = new BroadcastChannel(name)
    local.onmessage = (event) => options.onWire(event.data as Wire)
  }

  let joined = false
  let attending = false
  let net: RealtimeChannel | null = null
  try {
    net = getSupabase().channel(name, { config: { broadcast: { self: false }, presence: { key: 'audience' } } })
    net
      .on('broadcast', { event: 'w' }, (message) => options.onWire(message.payload as Wire))
      .on('presence', { event: 'sync' }, () => {
        if (!net) return
        const there = net.presenceState() as Record<string, unknown[]>
        options.onAudience?.(there.audience?.length ?? 0)
      })
      .subscribe((status) => {
        if (closed || !net) return
        joined = status === 'SUBSCRIBED'
        if (joined) {
          if (attending) void net.track({ at: Date.now() })
          options.onJoined?.()
        }
      })
  } catch {
    // No network leg: the local one still carries a presenter's own windows.
    net = null
  }

  return {
    send(wire) {
      if (closed) return
      local?.postMessage(wire)
      // Before the channel is joined a send falls back to an HTTP call per message, which
      // is not what a beat every few seconds should cost. What matters is said again on
      // `onJoined`, so nothing is lost by not sending into a channel that is not there.
      if (joined && net) void net.send({ type: 'broadcast', event: 'w', payload: wire })
    },
    attend() {
      if (attending) return
      attending = true
      if (joined && net) void net.track({ at: Date.now() })
    },
    close() {
      closed = true
      local?.close()
      if (net) void getSupabase().removeChannel(net)
    },
  }
}
