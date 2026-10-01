import { useEffect, useRef, useState, type MouseEvent } from 'react'

import { Owl } from '@/components/Owl'
import { SlideFace } from '@/demo/parts'
import { toHref } from '@/lib/routing'

import { FigureByName } from './FigureByName.tsx'
import { figureNamed } from './figures.ts'
import { applyScrolls, clean, lookAt, morph, resolve, scrollToFraction } from './mirror.ts'
import { unpack, type FrameMsg, type PointMsg, type ScrollMsg } from './protocol.ts'
import { useStage } from './useStage.ts'

/** The words. */
const SAID = {
  quiet: 'Nothing is on stage right now.',
  quietMore: 'When a presentation starts it appears here by itself. There is no need to reload.',
  closed: 'There is no stage here right now.',
  home: 'Go to RAGtime',
  live: 'Live',
  site: 'RAGtime',
  yourself: 'Open this page yourself',
  arriving: 'The presenter is opening the app.',
} as const

/** After the reader scrolls for themselves, how long the presenter's scrolling leaves them alone. */
const OWN_SCROLL_MS = 4_000

/** A slide or a figure fills the window, 16:9, whichever way the window is the tighter fit. */
const FILL = { width: 'min(100vw, calc(100dvh * 16 / 9))' } as const

/**
 * The stage: where an audience sits.
 *
 * One address for the whole presentation. Whatever the presenter puts up appears here —
 * a slide, a figure, or the app itself as they use it — as real text in the reader's own
 * window, at the reader's own size. Nothing here needs a password and nothing here can be
 * driven: the presenter drives (`/present`), and what they send is believed only because
 * it is signed with the key sealed in their kit (`protocol.ts`).
 *
 * When nobody is presenting the stage is quiet, and says so. It goes live by itself.
 */
export function StagePage() {
  const now = useStage()

  // F, as on the deck: the window on the projector is this page, and it should be able
  // to be the whole screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== 'f' && event.key !== 'F') || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (now.phase === 'opening') {
    return <main className="min-h-dvh bg-lawfare-paper" data-stage="opening" />
  }
  if (now.phase !== 'live' || !now.following.state) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-lawfare-paper px-6 text-foreground" data-stage="quiet">
        <div className="max-w-md text-center">
          {/* The owl keeps the house while it is empty, as it keeps the door. */}
          <Owl lantern="dark" keepsHours className="mx-auto w-24" title="RAGtime" />
          <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight">
            {now.phase === 'closed' ? SAID.closed : SAID.quiet}
          </h1>
          {now.phase !== 'closed' && <p className="mt-3 text-sm text-lawfare-text-secondary">{SAID.quietMore}</p>}
          <p className="mt-8 text-sm">
            <a href={toHref('/')} className="text-primary underline underline-offset-4">
              {SAID.home}
            </a>
          </p>
        </div>
      </main>
    )
  }

  const { state, frame, scroll, point } = now.following
  const scene = state.scene
  return (
    <main className="min-h-dvh bg-lawfare-paper text-foreground" data-stage="live" data-stage-scene={scene.kind}>
      {scene.kind === 'slide' && (
        <div className="flex min-h-dvh items-center justify-center">
          <SlideFace slide={scene} at={scene.at} of={scene.of} style={FILL} />
        </div>
      )}
      {scene.kind === 'figure' && (
        <div className="flex min-h-dvh items-center justify-center">
          <section
            aria-label={figureNamed(scene.name)?.title ?? scene.name}
            style={FILL}
            className="flex aspect-video flex-col bg-card px-[5cqw] py-[4cqw] [container-type:inline-size]"
          >
            <h2 className="mb-[2cqw] font-serif text-[3.4cqw] font-medium leading-tight tracking-tight">
              {figureNamed(scene.name)?.title}
            </h2>
            <div className="min-h-0 flex-1">
              <FigureByName name={scene.name} />
            </div>
          </section>
        </div>
      )}
      {scene.kind === 'mirror' && <Mirror frame={frame} scroll={scroll} point={point} />}
      <Pill path={scene.kind === 'mirror' ? (frame?.path ?? null) : null} />
    </main>
  )
}

/**
 * The corner that says this is live, and offers the way out of the audience: the site
 * itself, or — while the presenter is in the app — the very page they are on, opened for
 * real in a tab of the reader's own, with the same search in it.
 */
function Pill({ path }: { path: string | null }) {
  return (
    <div
      className="fixed bottom-3 left-3 z-[70] flex items-center gap-2.5 rounded-full border border-lawfare-line-strong bg-card/95 px-3 py-1.5 text-xs text-lawfare-text-secondary shadow-md"
      data-stage="pill"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <span className="size-2 rounded-full bg-red-600" aria-hidden="true" />
        {SAID.live}
      </span>
      {path !== null && path !== '/stage' && path !== '/present' && (
        <a href={toHref(path)} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
          {SAID.yourself}
        </a>
      )}
      <a href={toHref('/')} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
        {SAID.site}
      </a>
    </div>
  )
}

/**
 * The presenter's page (`mirror.ts`). React owns the empty element and nothing inside it:
 * each frame is morphed into place by hand, so React is never asked to reconcile markup
 * it did not write.
 */
function Mirror({ frame, scroll, point }: { frame: FrameMsg | null; scroll: ScrollMsg | null; point: PointMsg | null }) {
  const root = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(false)
  const own = useRef(0)
  const path = useRef<string | null>(null)

  // The reader's own scrolling wins for a moment, or following along would be a fight.
  useEffect(() => {
    const mine = () => {
      own.current = Date.now()
    }
    window.addEventListener('wheel', mine, { passive: true })
    window.addEventListener('touchmove', mine, { passive: true })
    window.addEventListener('keydown', mine)
    return () => {
      window.removeEventListener('wheel', mine)
      window.removeEventListener('touchmove', mine)
      window.removeEventListener('keydown', mine)
    }
  }, [])

  useEffect(() => {
    if (!frame) return
    let cancelled = false
    void unpack(frame.html).then(
      (html) => {
        const el = root.current
        // A newer frame has arrived while this one was unpacking: draw that one.
        if (cancelled || !el) return
        morph(el, clean(html))
        el.className = frame.cls
        for (const name of [...el.style]) if (name.startsWith('--') && !(name in frame.vars)) el.style.removeProperty(name)
        for (const [name, value] of Object.entries(frame.vars)) {
          if (name.startsWith('--')) el.style.setProperty(name, value)
        }
        const following = Date.now() - own.current > OWN_SCROLL_MS
        if (following) applyScrolls(el)
        // The window's own scroll travels in scroll messages; a frame only places it
        // when the page under it has changed, where "where it was" means nothing.
        if (path.current !== frame.path) {
          path.current = frame.path
          scrollToFraction(document.documentElement, frame.y)
        }
        setDrawn(true)
      },
      () => {
        /* a frame that will not unpack is skipped; the next one replaces it */
      },
    )
    return () => {
      cancelled = true
    }
  }, [frame])

  useEffect(() => {
    if (!scroll || !root.current || Date.now() - own.current < OWN_SCROLL_MS) return
    const target = scroll.at.length === 0 ? document.documentElement : resolve(root.current, scroll.at)
    if (target) scrollToFraction(target, scroll.y)
  }, [scroll])

  // The presenter's pointer, redrawn every frame from the element it is over: the page
  // scrolls and re-wraps under it, and none of that raises an event to listen for.
  useEffect(() => {
    const el = dot.current
    if (!el) return
    if (!point?.at) {
      el.style.opacity = '0'
      if (root.current) lookAt(root.current, null)
      return
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const under = root.current && point.at ? resolve(root.current, point.at) : null
      const box = under?.getBoundingClientRect()
      if (!box || box.width === 0) {
        el.style.opacity = '0'
        return
      }
      const x = box.left + box.width * point.x
      const y = box.top + box.height * point.y
      el.style.opacity = '1'
      el.style.transform = `translate(${x}px, ${y}px)`
      // And the owl, if the page has one, looks where the presenter is pointing.
      if (root.current) lookAt(root.current, { x, y })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [point])

  // A link opens beside the stage (`clean` gave each a new tab). Any other kind of link
  // — one inside an SVG, say — would take the reader off the stage, so it does nothing.
  // Buttons need no help to do nothing: there is no app behind them.
  function onClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as Element).closest('a')
    if (!link) return
    if (link instanceof HTMLAnchorElement && link.target === '_blank' && link.href) return
    event.preventDefault()
  }

  return (
    <>
      {!drawn && <p className="px-6 py-10 text-sm text-lawfare-text-secondary">{SAID.arriving}</p>}
      <div ref={root} data-stage="mirror" onClickCapture={onClick} onSubmitCapture={(event) => event.preventDefault()} />
      <div
        ref={dot}
        aria-hidden="true"
        data-stage="pointer"
        className="pointer-events-none fixed left-0 top-0 z-[69] -ml-2.5 -mt-2.5 size-5 rounded-full border-2 border-primary bg-primary/25 opacity-0 transition-[transform,opacity] duration-200 ease-linear"
      />
    </>
  )
}
