import { useEffect, useState, useSyncExternalStore } from 'react'

import { fetchSealed } from '@/demo/useKit'
import { withViewTransition } from '@/lib/transition'

import { openLink, type Link } from './link.ts'
import { presenterView, watchPresenter, type PresenterView } from './presenter.ts'
import {
  NOBODY,
  accept,
  isLive,
  token,
  unpack,
  type Following,
  type FrameMsg,
  type Msg,
  type PointMsg,
  type Scene,
  type ScrollMsg,
} from './protocol.ts'

/** How long a new arrival waits for an answer before deciding nothing is on. */
const OPENING_MS = 2_500

/** The least time between two "what is on?"s from one reader. */
const HELLO_EVERY_MS = 3_000

/** How long to hold what is up while the first picture of the presenter's page is on its way. */
const PAGE_WAIT_MS = 1_500

/** One picture of the presenter's page, unpacked and ready to draw. */
export type Page = {
  n: number
  sid: string
  path: string
  html: string
  cls: string
  vars: Record<string, string>
  y: number
}

export type StageNow =
  /** Still finding out. Shown as nothing at all, so a live stage does not flash "quiet" first. */
  | { phase: 'opening' }
  /** There is no stage here: no kit, or one sealed before the stage existed. */
  | { phase: 'closed' }
  | { phase: 'quiet' }
  | {
      phase: 'live'
      scene: Scene
      page: Page | null
      scroll: ScrollMsg | null
      point: PointMsg | null
      /** The object the presenter has brought forward, in a record scene. */
      focus: string | null
    }

/**
 * What a change has to differ in to be a change of scene, and so to be shown as one: a
 * different slide, a different figure, a different page of the app. A new picture of the
 * same page is not one, and neither is a scroll.
 */
function sceneKey(now: StageNow): string {
  if (now.phase !== 'live') return now.phase
  if (now.scene.kind === 'mirror') return 'mirror:' + (now.page ? now.page.path.split('?')[0] : '')
  // A search is the same scene before and after it answers: the floor stays, and what
  // changes is that things are flown onto it.
  if (now.scene.kind === 'record') return `record:${now.scene.corpus}:${now.scene.query}`
  return JSON.stringify(now.scene)
}

/**
 * What is on stage, for the page that shows it.
 *
 * A reader does three things: listens, asks once on arrival ("what is on?", so a late
 * arrival is not left waiting for the presenter's next move), and notices silence. The
 * rules for what to believe are `accept`'s; this is the plumbing around them.
 *
 * **A change of scene is a navigation**, and is shown as this app shows one: inside a
 * view transition (`lib/transition.ts`). So a title travels to where the next one is, and
 * when the presenter walks into the app the stage does what the app does on a route
 * change — the bar holds still, the headline moves, the cards arrive in their wave —
 * because the page that arrives carries the same names the app's own pages carry. For
 * that to work the new page has to be complete when the transition takes its second
 * picture, so a frame is unpacked *here*, before it is shown, and the stage holds what
 * was up until it is.
 */
export function useStage(): StageNow {
  const [now, setNow] = useState<StageNow>({ phase: 'opening' })

  useEffect(() => {
    let cancelled = false
    let release = () => {}
    let tick = 0
    const nonce = token()
    const opened = Date.now()
    let asked = 0
    let link: Link | null = null
    let following: Following = NOBODY
    let shown: StageNow = { phase: 'opening' }
    let page: Page | null = null
    let unpacking = -1
    let waitingSince = 0

    const ask = () => {
      if (!link || Date.now() - asked < HELLO_EVERY_MS) return
      asked = Date.now()
      link.hello(nonce)
    }

    const show = (next: StageNow) => {
      if (cancelled) return
      const moved = sceneKey(shown) !== sceneKey(next)
      shown = next
      // A transition applies its update a frame later, and something smaller — a thing
      // brought forward, a scroll — can arrive and be applied in that frame. So what the
      // transition applies is whatever is newest when it runs, not what was newest when
      // it was asked for; otherwise it would put the older state back on top.
      if (moved) withViewTransition(() => setNow(shown))
      else setNow(next)
    }

    const take = (frame: FrameMsg) => {
      unpacking = frame.n
      void unpack(frame.html).then(
        (html) => {
          // Only the newest picture matters; an older one that finishes late is dropped.
          if (cancelled || following.frame?.n !== frame.n) return
          page = { n: frame.n, sid: frame.sid, path: frame.path, html, cls: frame.cls, vars: frame.vars, y: frame.y }
          settle()
        },
        () => {
          /* a frame that will not unpack is skipped; the next one replaces it */
        },
      )
    }

    const settle = () => {
      if (cancelled) return
      const at = Date.now()
      const state = following.state
      if (!isLive(following, at) || !state) {
        page = null
        if (following.holder === null && shown.phase === 'opening' && at - opened < OPENING_MS) return
        if (shown.phase !== 'quiet') show({ phase: 'quiet' })
        return
      }
      const { scene } = state
      if (scene.kind !== 'mirror') {
        waitingSince = 0
        if (shown.phase !== 'live' || shown.scene !== scene || shown.focus !== following.focus) {
          show({ phase: 'live', scene, page: null, scroll: null, point: null, focus: following.focus })
        }
        return
      }
      // A different presenter's page is not this presenter's page.
      if (page && page.sid !== state.sid) page = null
      const frame = following.frame
      if (frame && frame.n !== page?.n && frame.n !== unpacking) take(frame)
      if (!page) {
        // The presenter is in the app and its first picture has not arrived. Keep what is
        // up rather than cut to an empty page — but not forever.
        waitingSince ||= at
        const held = shown.phase === 'live' && shown.scene.kind !== 'mirror'
        if (at - waitingSince < PAGE_WAIT_MS && (held || shown.phase !== 'live')) return
      } else {
        waitingSince = 0
      }
      const { scroll, point } = following
      if (
        shown.phase !== 'live' ||
        shown.scene.kind !== 'mirror' ||
        shown.page !== page ||
        shown.scroll !== scroll ||
        shown.point !== point
      ) {
        show({ phase: 'live', scene, page, scroll, point, focus: null })
      }
    }

    const onMsg = (msg: Msg) => {
      const before = following
      following = accept(before, msg, Date.now(), nonce)
      const holder = following.holder
      // Somebody is presenting and this reader does not have what they are showing —
      // it arrived mid-presentation, or a message was lost. Ask.
      if (msg.kind !== 'state' && msg.kind !== 'bye') {
        const mine = holder?.sid === msg.sid
        if (!holder) ask()
        else if (mine && msg.kind === 'beat') {
          if (following.state?.n !== msg.on) ask()
          else if (msg.frame !== null && (following.frame?.n ?? -1) < msg.frame) ask()
        }
      }
      if (following !== before) settle()
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
      release = link.add({
        onMsg,
        onJoined: () => {
          asked = 0
          ask()
        },
      })
      link.attend()
      ask()
      tick = window.setInterval(settle, 500)
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
