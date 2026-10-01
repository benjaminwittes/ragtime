import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { fetchSealed } from '@/demo/useKit'

import { openLink, type Link } from './link.ts'
import { presenterView, watchPresenter, type PresenterView } from './presenter.ts'
import { NOBODY, accept, isLive, token, type Following, type Msg } from './protocol.ts'

/** How long a new arrival waits for an answer before deciding nothing is on. */
const OPENING_MS = 2_500

/** The least time between two "what is on?"s from one reader. */
const HELLO_EVERY_MS = 3_000

export type StageNow =
  /** Still finding out. Shown as nothing at all, so a live stage does not flash "quiet" first. */
  | { phase: 'opening' }
  /** There is no stage here: no kit, or one sealed before the stage existed. */
  | { phase: 'closed' }
  | { phase: 'quiet' }
  | { phase: 'live'; following: Following }

/**
 * What is on stage, for the page that shows it.
 *
 * A reader does three things: listens, asks once on arrival ("what is on?", so a late
 * arrival is not left waiting for the presenter's next move), and notices silence. The
 * rules for what to believe are `accept`'s; this is the plumbing around them.
 */
export function useStage(): StageNow {
  const [now, setNow] = useState<StageNow>({ phase: 'opening' })
  const following = useRef<Following>(NOBODY)

  useEffect(() => {
    let cancelled = false
    let release = () => {}
    let tick = 0
    const nonce = token()
    const opened = Date.now()
    let asked = 0
    let link: Link | null = null

    const ask = () => {
      if (!link || Date.now() - asked < HELLO_EVERY_MS) return
      asked = Date.now()
      link.hello(nonce)
    }

    const publish = () => {
      if (cancelled) return
      const at = Date.now()
      if (isLive(following.current, at)) {
        setNow((was) =>
          was.phase === 'live' && was.following === following.current ? was : { phase: 'live', following: following.current },
        )
      } else if (at - opened < OPENING_MS && following.current.holder === null) {
        // Leave it at `opening`.
      } else {
        setNow((was) => (was.phase === 'quiet' ? was : { phase: 'quiet' }))
      }
    }

    const onMsg = (msg: Msg) => {
      const before = following.current
      following.current = accept(before, msg, Date.now(), nonce)
      const holder = following.current.holder
      // Somebody is presenting and this reader does not have what they are showing —
      // it arrived mid-presentation, or a message was lost. Ask.
      if (msg.kind !== 'state' && msg.kind !== 'bye') {
        const mine = holder?.sid === msg.sid
        if (!holder) ask()
        else if (mine && msg.kind === 'beat') {
          const state = following.current.state
          if (state?.n !== msg.on) ask()
          else if (msg.frame !== null && (following.current.frame?.n ?? -1) < msg.frame) ask()
        }
      }
      if (following.current !== before) publish()
    }

    void (async () => {
      const sealed = await fetchSealed()
      if (cancelled) return
      if (!sealed?.stage?.pub) {
        setNow({ phase: 'closed' })
        return
      }
      link = await openLink(sealed.stage.pub)
      if (cancelled) return
      release = link.add({ onMsg, onJoined: () => {
        asked = 0
        ask()
      } })
      link.attend()
      ask()
      tick = window.setInterval(publish, 1_000)
    })()

    return () => {
      cancelled = true
      window.clearInterval(tick)
      release()
    }
  }, [])

  return now
}

/** The presenter's state, for the console and the dock. */
export function usePresenter(): PresenterView {
  return useSyncExternalStore(watchPresenter, presenterView)
}
