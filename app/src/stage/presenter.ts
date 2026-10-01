import type { Kit, SealedKit } from '@/demo/kit'
import { toLogical } from '@/lib/routing'

import { openLink, type Link } from './link.ts'
import { capture, pathOf, windowFraction } from './mirror.ts'
import {
  BEAT_EVERY_MS,
  NOBODY,
  accept,
  isLive,
  pack,
  sign,
  signingKey,
  token,
  type Following,
  type Msg,
  type Scene,
  type Signed,
} from './protocol.ts'

/**
 * The presenter: one per tab, alive for as long as the tab is, wherever in the app the
 * tab goes.
 *
 * That last part is the design. A presenter does not present *from* a page; they present
 * from the app. On `/present` the stage shows the slide they are on. When they walk into
 * the app itself — the hub, a search, the Explorer — the stage shows that page instead
 * (`mirror.ts`), and when they come back it shows the slide again. So this cannot live in
 * a component: a route change would unmount it mid-sentence. It is a module, and the
 * pages that show its state subscribe to it (`usePresenter.ts`).
 *
 * One presenter holds the stage at a time. A second person with the kit can take it by
 * going live; this one then stops, and says so, rather than fighting for it.
 */

/** What the console can put on stage that is not a page of the app. */
export type Face = { kind: 'slide' } | { kind: 'figure'; name: string }

export type PresenterView = {
  /** The kit is open and can sign. */
  armed: boolean
  live: boolean
  at: number
  face: Face
  /** Away from the console, show the page the presenter is on. Off, the stage holds the slide. */
  showApp: boolean
  who: string
  /** How many people are at `/stage`, as far as the channel knows. */
  audience: number
  /** The network leg is up. Without it only this browser's own windows are following. */
  joined: boolean
  /** Someone else is presenting right now. */
  other: { who: string } | null
  /** This tab was presenting and someone else took the stage from it. */
  yielded: boolean
  /** This tab is on `/present`. */
  onConsole: boolean
  /**
   * This tab is somewhere the room must never be shown: the console, the kit's guide and
   * deck, the stage itself. There the stage holds the slide whatever `showApp` says.
   */
  backstage: boolean
  /** What the stage is being told to show. Null when nothing is. */
  scene: Scene | null
}

const SESSION = 'ragtime_stage_presenting_v1'
const WHO = 'ragtime_stage_who_v1'

/** The least time between two pictures of the page. A streaming answer is the busy case. */
const FRAME_EVERY_MS = 450
const SCROLL_EVERY_MS = 120
const POINT_EVERY_MS = 200
/** Arrivals within this long of each other are answered together. */
const HELLO_WAIT_MS = 300
/**
 * How long after a route change before the page is pictured. The router wraps the change
 * in a view transition, so for the first moments the document still holds the page being
 * left — and when that page is the console, it holds the presenter's notes.
 */
const ROUTE_SETTLE_MS = 150

let view: PresenterView = {
  armed: false,
  live: false,
  at: 0,
  face: { kind: 'slide' },
  showApp: true,
  who: '',
  audience: 0,
  joined: false,
  other: null,
  yielded: false,
  onConsole: false,
  backstage: true,
  scene: null,
}

const watchers = new Set<() => void>()

function set(patch: Partial<PresenterView>) {
  view = { ...view, ...patch }
  try {
    const { live, at, face, showApp } = view
    window.sessionStorage.setItem(SESSION, JSON.stringify({ live, at, face, showApp }))
  } catch {
    /* a tab that cannot remember simply starts at the first slide after a reload */
  }
  for (const watcher of watchers) watcher()
}

export function watchPresenter(watcher: () => void): () => void {
  watchers.add(watcher)
  return () => watchers.delete(watcher)
}

export function presenterView(): PresenterView {
  return view
}

/** True when this tab was presenting before a reload, so it should pick up without being asked. */
export function wasPresenting(): boolean {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION) ?? '{}').live === true
  } catch {
    return false
  }
}

let kit: Kit | null = null
let link: Link | null = null
let key: CryptoKey | null = null
let sid = ''
let n = 0
/** Sends are signed one after another, so they leave in the order they were made. */
let sending: Promise<void> = Promise.resolve()
/** What others on the channel are doing: this is how a takeover is noticed. */
let others: Following = NOBODY

let beat = 0
/** When this tab went live: the claim every state it sends carries. */
let since = 0
/** The numbers of the state and the frame last sent, which every beat repeats. */
let stateN = 0
let frameN: number | null = null
let lastStateKey = ''
let waitingHellos: string[] = []
let helloTimer = 0
/**
 * A goodbye signed ahead of time. Signing takes a moment and a closing tab does not have
 * one, so there is always one ready, re-made with each beat so that it is never stale.
 */
let spareBye: Signed | null = null

function readyBye() {
  if (!key) return
  const made = sid
  void sign({ v: 1, sid, n: Number.MAX_SAFE_INTEGER, t: Date.now(), kind: 'bye' }, key).then((signed) => {
    if (made === sid) spareBye = signed
  })
}
/** This tab's own "who is presenting?", asked while it is not: a console wants to know too. */
const nonce = token()
let asked = 0

function ask() {
  if (!link || view.live || Date.now() - asked < 3_000) return
  asked = Date.now()
  link.hello(nonce)
}

function send(make: (stamp: { v: 1; sid: string; n: number; t: number }) => Msg) {
  if (!link || !key) return
  const to = link
  const with_ = key
  sending = sending.then(async () => {
    const msg = make({ v: 1, sid, n: n++, t: Date.now() })
    to.send(await sign(msg, with_))
  })
}

function sceneNow(): Scene | null {
  if (!kit) return null
  if (!view.backstage && view.showApp) return { kind: 'mirror' }
  if (view.face.kind === 'figure') return { kind: 'figure', name: view.face.name }
  const slide = kit.slides[view.at]
  if (!slide) return null
  // Never the notes: they are the presenter's, and a slide scene goes to the room.
  return { kind: 'slide', at: view.at, of: kit.slides.length, part: slide.part, title: slide.title, body: slide.body }
}

/**
 * Say what is on stage — when it changed, or when someone asked (`re`). The one place the
 * scene is decided, so the mirror is started and stopped here too.
 */
function tell(re?: string[]) {
  const scene = sceneNow()
  const stateKey = JSON.stringify(scene)
  const changed = stateKey !== lastStateKey
  if (changed) {
    lastStateKey = stateKey
    set({ scene })
  }
  if (!view.live || !scene) {
    stopMirror()
    return
  }
  if (changed || re) {
    send((stamp) => {
      stateN = stamp.n
      if (scene.kind !== 'mirror') frameN = null
      return { ...stamp, kind: 'state', who: view.who, since, scene, ...(re ? { re } : {}) }
    })
  }
  if (scene.kind === 'mirror') {
    startMirror()
    // A new arrival needs the picture as well as the fact that there is one. A change of
    // scene does not get one at once: it is usually a change of route, and the page that
    // is in the document at this instant is still the one being left.
    if (re) frame(re)
    else if (changed) dirty(ROUTE_SETTLE_MS)
  } else {
    stopMirror()
  }
}

// ── The mirror: this page, sent as markup ───────────────────────────────────────────────

let observer: MutationObserver | null = null
let frameTimer = 0
let frameBusy = false
let frameAgain = false
let lastFrameAt = 0
let lastFrameKey = ''
/** Arrivals waiting for a picture: the next frame quotes them, changed or not. */
let frameRe: string[] | undefined
let scrollTimer = 0
let scrollTarget: EventTarget | null = null
let pointTimer = 0
let pointAt: { x: number; y: number } | null = null
let lastPointKey = ''

function dirty(atLeast = 0) {
  if (frameTimer) return
  frameTimer = window.setTimeout(
    () => {
      frameTimer = 0
      frame()
    },
    Math.max(atLeast, lastFrameAt + FRAME_EVERY_MS - Date.now()),
  )
}

/** A mutation, which is what the observer reports. Its arguments are not a delay. */
function mutated() {
  dirty()
}

function frame(re?: string[]) {
  if (re) frameRe = [...(frameRe ?? []), ...re].slice(-60)
  if (frameBusy) {
    frameAgain = true
    return
  }
  // Stamped before anything is decided: a page that mutates without changing — the dock
  // counting the audience, say — must not buy a fresh capture on every mutation.
  lastFrameAt = Date.now()
  const path = toLogical(window.location.pathname) + window.location.search
  const taken = capture(document)
  const frameKey = path + '\n' + taken.cls + '\n' + taken.html
  // An identical picture is not sent twice, unless someone has just arrived without one.
  if (frameKey === lastFrameKey && !frameRe) return
  lastFrameKey = frameKey
  const quoting = frameRe
  frameRe = undefined
  frameBusy = true
  const y = windowFraction(window)
  void pack(taken.html).then((html) => {
    frameBusy = false
    // The scene may have changed while this was being packed; a picture of the app is
    // not sent to a stage that is back on a slide.
    if (view.live && view.scene?.kind === 'mirror') {
      send((stamp) => {
        frameN = stamp.n
        return { ...stamp, kind: 'frame', path, html, cls: taken.cls, vars: taken.vars, y, ...(quoting ? { re: quoting } : {}) }
      })
    }
    if (frameAgain) {
      frameAgain = false
      dirty()
    }
  })
}

function onScroll(event: Event) {
  scrollTarget = event.target
  if (scrollTimer) return
  scrollTimer = window.setTimeout(() => {
    scrollTimer = 0
    const target = scrollTarget
    if (target === document || target === document.documentElement || target === document.body) {
      send((stamp) => ({ ...stamp, kind: 'scroll', at: [], y: windowFraction(window) }))
    } else if (target instanceof Element) {
      const at = pathOf(target, document.body)
      const room = target.scrollHeight - target.clientHeight
      if (at && room > 0) send((stamp) => ({ ...stamp, kind: 'scroll', at, y: target.scrollTop / room }))
    }
  }, SCROLL_EVERY_MS)
}

function onPoint(event: PointerEvent) {
  pointAt = event.type === 'pointerleave' ? null : { x: event.clientX, y: event.clientY }
  if (pointTimer) return
  pointTimer = window.setTimeout(() => {
    pointTimer = 0
    // The pointer is sent as a place *in an element*, not on the screen: the room's
    // windows are other sizes, and "over this result" survives a re-layout where
    // "412 pixels from the left" does not.
    let at: number[] | null = null
    let x = 0
    let y = 0
    let under = pointAt ? document.elementFromPoint(pointAt.x, pointAt.y) : null
    // While the router's view transition is running the browser answers "what is under
    // the pointer" with the document itself. That is the page, not nowhere.
    if (under === document.documentElement) under = document.body
    if (pointAt && under) {
      at = pathOf(under, document.body)
      const box = under.getBoundingClientRect()
      if (at && box.width > 0 && box.height > 0) {
        x = Math.round(((pointAt.x - box.left) / box.width) * 1000) / 1000
        y = Math.round(((pointAt.y - box.top) / box.height) * 1000) / 1000
      } else at = null
    }
    const pointKey = JSON.stringify([at, x, y])
    if (pointKey === lastPointKey) return
    lastPointKey = pointKey
    send((stamp) => ({ ...stamp, kind: 'point', at, x, y }))
  }, POINT_EVERY_MS)
}

function startMirror() {
  if (observer) return
  observer = new MutationObserver(mutated)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  // A typed character changes a property, not the markup, so no mutation is recorded.
  document.addEventListener('input', mutated, true)
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  document.addEventListener('pointermove', onPoint, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPoint)
}

function stopMirror() {
  if (!observer) return
  observer.disconnect()
  observer = null
  document.removeEventListener('input', mutated, true)
  document.removeEventListener('scroll', onScroll, true)
  document.removeEventListener('pointermove', onPoint)
  document.documentElement.removeEventListener('pointerleave', onPoint)
  window.clearTimeout(frameTimer)
  window.clearTimeout(scrollTimer)
  window.clearTimeout(pointTimer)
  frameTimer = scrollTimer = pointTimer = 0
  lastFrameKey = ''
  lastPointKey = ''
  frameRe = undefined
}

// ── The channel ─────────────────────────────────────────────────────────────────────────

/** Where this tab is, as the two things the scene depends on. */
function whereabouts(): { onConsole: boolean; backstage: boolean } {
  const path = toLogical(window.location.pathname).replace(/\/+$/, '')
  const onConsole = path === '/present'
  return { onConsole, backstage: onConsole || path === '/stage' || path === '/demo' || path.startsWith('/demo/') }
}

function onRoute() {
  const here = whereabouts()
  if (here.onConsole !== view.onConsole || here.backstage !== view.backstage) set(here)
  tell()
  // A route change swaps the page under the mirror; do not wait for the next mutation,
  // but do wait for the swap.
  if (view.live && view.scene?.kind === 'mirror') dirty(ROUTE_SETTLE_MS)
}

function onMsg(msg: Msg) {
  if (msg.sid === sid) return
  // An older claim than this tab's own: someone superseded, who has not heard yet.
  if (view.live && msg.kind === 'state' && msg.since <= since) return
  const before = others
  others = accept(others, msg, Date.now(), nonce)
  // Someone is out there and this console does not know what they have on: it opened
  // mid-presentation. Ask, so it can say who is presenting.
  if (!others.holder && msg.kind !== 'state' && msg.kind !== 'bye') ask()
  if (others === before) return
  const live = isLive(others, Date.now())
  const other = live && others.holder ? { who: others.holder.who } : null
  // Someone else has put something on stage after this tab did: they hold it now.
  if (view.live && msg.kind === 'state' && others.holder?.sid === msg.sid) {
    window.clearInterval(beat)
    set({ live: false, other, yielded: true })
    tell()
    return
  }
  if (JSON.stringify(other) !== JSON.stringify(view.other)) set({ other })
}

function onHello(theirs: string) {
  if (!view.live) return
  waitingHellos.push(theirs)
  // A hidden tab's timers are slowed, to as little as one a minute, and an arrival
  // cannot wait a minute to learn there is a presentation on. A message arriving is not
  // a timer, so while hidden each one is answered as it comes.
  if (document.hidden) {
    window.clearTimeout(helloTimer)
    helloTimer = 0
    const re = waitingHellos.slice(-60)
    waitingHellos = []
    tell(re)
    return
  }
  if (helloTimer) return
  helloTimer = window.setTimeout(() => {
    helloTimer = 0
    const re = waitingHellos.slice(-60)
    waitingHellos = []
    tell(re)
  }, HELLO_WAIT_MS)
}

/**
 * Give this tab the kit. Idempotent: the console arms on every visit, and the dock arms
 * after a reload. Returns false for a kit that cannot present — one sealed before the
 * stage existed has no signing key.
 */
export function arm(opened: Kit, sealed: SealedKit): Promise<boolean> {
  // One at a time. The console arms when it mounts and the dock arms after a reload, and
  // both can be in the middle of it at once; two that each believed they were first
  // would listen twice and answer every arrival twice.
  arming = arming.then(
    () => armOne(opened, sealed),
    () => armOne(opened, sealed),
  )
  return arming
}

let arming: Promise<boolean> = Promise.resolve(false)

async function armOne(opened: Kit, sealed: SealedKit): Promise<boolean> {
  if (!opened.stage?.key || !sealed.stage?.pub) return false
  if (view.armed && kit === opened) return true
  const first = !view.armed
  kit = opened
  key = await signingKey(opened.stage.key)
  link = await openLink(sealed.stage.pub)
  if (first) {
    sid = token()
    link.add({
      onMsg,
      onHello,
      onAudience: (audience) => set({ audience }),
      onJoined: () => {
        set({ joined: true })
        // The network leg has just come up, or come back: whoever is out there has not
        // heard what is on.
        lastStateKey = ''
        tell()
        asked = 0
        ask()
      },
    })
    ask()
    window.addEventListener('popstate', onRoute)
    window.addEventListener('pagehide', () => {
      if (view.live && spareBye && link) link.send(spareBye)
    })
    // A tab brought back from the back/forward cache is the same tab, still live, but
    // its goodbye has used up its name: nothing more from that session would be believed.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted || !view.live) return
      sid = token()
      n = 0
      since = Date.now()
      lastStateKey = ''
      readyBye()
      tell()
    })
    let remembered: Partial<PresenterView> = {}
    try {
      remembered = JSON.parse(window.sessionStorage.getItem(SESSION) ?? '{}') as Partial<PresenterView>
    } catch {
      /* nothing remembered */
    }
    let who = ''
    try {
      who = window.localStorage.getItem(WHO) ?? ''
    } catch {
      /* no name */
    }
    const at = Number.isInteger(remembered.at) && remembered.at! >= 0 && remembered.at! < opened.slides.length ? remembered.at! : 0
    set({
      armed: true,
      at,
      face: remembered.face ?? { kind: 'slide' },
      showApp: remembered.showApp ?? true,
      who,
      ...whereabouts(),
    })
    tell()
    if (remembered.live === true) goLive()
  } else {
    set({ at: Math.min(view.at, opened.slides.length - 1) })
    tell()
  }
  return true
}

export function goLive() {
  if (!view.armed || view.live) return
  // Whoever was presenting is about to be superseded; forget them so their next beat is
  // not mistaken for a takeover of this one.
  others = NOBODY
  since = Date.now()
  lastStateKey = ''
  set({ live: true, other: null, yielded: false })
  tell()
  window.clearInterval(beat)
  readyBye()
  beat = window.setInterval(() => {
    send((stamp) => ({ ...stamp, kind: 'beat', on: stateN, frame: frameN }))
    readyBye()
  }, BEAT_EVERY_MS)
}

export function stop() {
  if (!view.live) return
  window.clearInterval(beat)
  send((stamp) => ({ ...stamp, kind: 'bye' }))
  set({ live: false })
  tell()
}

/** Stop saying that someone took the stage. */
export function dismissYielded() {
  if (view.yielded) set({ yielded: false })
}

export function goTo(at: number) {
  if (!kit) return
  set({ at: Math.max(0, Math.min(kit.slides.length - 1, at)), face: { kind: 'slide' } })
  tell()
}

export function showFace(face: Face) {
  set({ face })
  tell()
}

export function setShowApp(showApp: boolean) {
  set({ showApp })
  tell()
}

export function setWho(who: string) {
  try {
    window.localStorage.setItem(WHO, who)
  } catch {
    /* the name lasts as long as the tab */
  }
  set({ who })
  if (view.live) {
    lastStateKey = ''
    tell()
  }
}

/** The deck this tab is armed with, for the pages that draw it. */
export function presenterKit(): Kit | null {
  return kit
}
