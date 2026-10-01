import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react'

import { Mark } from '@/components/Mark'
import { SurfaceIntro } from '@/components/SurfaceIntro'
import { toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'

import { FigureByName } from './FigureByName.tsx'
import { figureNamed } from './figures.ts'
import { applyScrolls, clean, morph, resolve, scrollToFraction } from './mirror.ts'
import type { PointMsg, ScrollMsg } from './protocol.ts'
import { RecordStage } from './RecordStage.tsx'
import { StageWords } from './StageWords.tsx'
import { useStage, type Page } from './useStage.ts'

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
  older: 'This page is older than the presentation. Reload it to see what is on.',
} as const

/** After the reader scrolls for themselves, how long the presenter's scrolling leaves them alone. */
const OWN_SCROLL_MS = 4_000

/**
 * The stage: where an audience sits.
 *
 * One address for the whole presentation. Whatever the presenter puts up appears here, in
 * the reader's own window, and none of it is a picture: words are lettered on the wall
 * (`StageWords`), a search is brought on as objects standing on a floor (`RecordStage`),
 * a figure is drawn live, and when the presenter walks into the app the house lights come
 * up and it is the app itself (`mirror.ts`). Nothing here needs a password and nothing
 * here can be driven: the presenter drives (`/present`), and what they send is believed
 * only because it is signed with the key sealed in their kit (`protocol.ts`).
 *
 * When nobody is presenting the house is dark, and says so. It goes live by itself.
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
    return <main className="stage-house min-h-dvh" data-stage="opening" />
  }
  if (now.phase !== 'live') {
    return (
      <main className="stage-house flex min-h-dvh items-center justify-center px-6" data-stage="quiet">
        <div className="max-w-md text-center">
          <Mark size={48} className="mx-auto text-[color:var(--house-ink-faint)]" title="RAGtime" />
          <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight">{now.phase === 'closed' ? SAID.closed : SAID.quiet}</h1>
          {now.phase !== 'closed' && <p className="mt-3 text-sm text-[color:var(--house-ink-soft)]">{SAID.quietMore}</p>}
          <p className="mt-8 text-sm">
            <a href={toHref('/')} className="text-[color:var(--house-accent)] underline underline-offset-4">
              {SAID.home}
            </a>
          </p>
        </div>
      </main>
    )
  }

  const { scene } = now
  if (scene.kind === 'mirror') {
    // The house lights are up: this is a page of the app, on the app's own paper.
    return (
      <main className="min-h-dvh bg-lawfare-paper text-foreground" data-stage="live" data-stage-scene="mirror">
        <Mirror page={now.page} scroll={now.scroll} point={now.point} />
        <Pill path={now.page?.path ?? null} />
      </main>
    )
  }

  return (
    <main className="stage-house flex min-h-dvh flex-col" data-stage="live" data-stage-scene={scene.kind}>
      {/* The measure everything on the paper is sized against. An inner element, because
          a container is also the frame its fixed descendants are placed in, and the
          corner pill belongs to the window. */}
      <div className="flex flex-1 flex-col [container-type:inline-size]">
          {scene.kind === 'slide' ? (
            <div className="grid flex-1 items-center">
              <StageWords scene={scene} />
            </div>
          ) : scene.kind === 'record' ? (
            <RecordStage scene={scene} focus={now.focus} />
          ) : scene.kind === 'figure' ? (
            <article className="mx-auto my-auto w-full max-w-[76rem] px-[clamp(1.25rem,5cqi,5rem)] py-[clamp(2rem,5cqi,4rem)]">
              <SurfaceIntro
                level={1}
                heading={figureNamed(scene.name)?.title ?? scene.name}
                lede={null}
                headingClassName="font-serif text-[clamp(1.75rem,4.6cqi,4rem)] font-medium leading-[1.05] tracking-tight text-[color:var(--house-ink)]"
                ledeClassName="hidden"
              />
              <div className="stage-body mt-[clamp(1rem,2.4cqi,2rem)] rounded-md border border-[color:var(--house-rule)] bg-card p-[clamp(1rem,3cqi,2.5rem)] text-foreground [container-type:inline-size]">
                <FigureByName name={scene.name} />
              </div>
            </article>
          ) : (
            <p className="my-auto px-6 text-center text-sm text-[color:var(--house-ink-soft)]">{SAID.older}</p>
          )}
      </div>
      {scene.kind === 'slide' && (
        // Where the presentation is, as a line along the foot of the wall. Named, so it
        // lengthens across a change of beat instead of being redrawn at its new length.
        <div className="fixed inset-x-0 bottom-0 z-20 h-[3px] bg-black/10" aria-hidden="true">
          <div
            className="h-full bg-[color:var(--house-accent)]"
            style={{
              width: `${((scene.at + 1) / scene.of) * 100}%`,
              viewTransitionName: 'stage-progress',
            }}
          />
        </div>
      )}
      <Pill path={null} />
    </main>
  )
}

/**
 * The corner that says this is live, and offers the way out of the audience: the site
 * itself, or — while the presenter is in the app — the very page they are on, opened for
 * real in a tab of the reader's own, with the same search in it.
 */
function Pill({ path, dark = false }: { path: string | null; dark?: boolean }) {
  return (
    <div
      className={cn(
        'fixed bottom-3 left-3 z-[70] flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-xs shadow-md',
        dark
          ? 'border-white/15 bg-black/35 text-[color:var(--house-ink-soft)] backdrop-blur-sm'
          : 'border-lawfare-line-strong bg-card/95 text-lawfare-text-secondary',
      )}
      data-stage="pill"
    >
      <span className={cn('inline-flex items-center gap-1.5 font-semibold', dark ? 'text-[color:var(--house-ink)]' : 'text-foreground')}>
        <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
        {SAID.live}
      </span>
      {path !== null && path !== '/stage' && path !== '/present' && (
        <a href={toHref(path)} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
          {SAID.yourself}
        </a>
      )}
      <a
        href={toHref('/')}
        target="_blank"
        rel="noopener noreferrer"
        className={dark ? 'hover:text-[color:var(--house-ink)]' : 'hover:text-foreground'}
      >
        {SAID.site}
      </a>
    </div>
  )
}

/**
 * The presenter's page (`mirror.ts`). React owns the empty element and nothing inside it:
 * each picture is morphed into place by hand, so React is never asked to reconcile markup
 * it did not write.
 *
 * In a layout effect, not an effect: a new page arrives inside a view transition
 * (`useStage`), and the transition takes its picture of "after" the moment React has
 * committed. The page has to be in the document by then, and a layout effect is the last
 * thing that runs before it is.
 */
function Mirror({ page, scroll, point }: { page: Page | null; scroll: ScrollMsg | null; point: PointMsg | null }) {
  const root = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
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

  useLayoutEffect(() => {
    const el = root.current
    if (!el || !page) return
    morph(el, clean(page.html))
    el.className = page.cls
    for (const name of [...el.style]) if (name.startsWith('--') && !(name in page.vars)) el.style.removeProperty(name)
    for (const [name, value] of Object.entries(page.vars)) {
      if (name.startsWith('--')) el.style.setProperty(name, value)
    }
    if (Date.now() - own.current > OWN_SCROLL_MS) applyScrolls(el)
    // The window's own scroll travels in scroll messages; a picture only places it when
    // the page under it has changed, where "where it was" means nothing.
    if (path.current !== page.path) {
      path.current = page.path
      scrollToFraction(document.documentElement, page.y)
    }
  }, [page])

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
      el.style.opacity = '1'
      el.style.transform = `translate(${box.left + box.width * point.x}px, ${box.top + box.height * point.y}px)`
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
      {!page && <p className="px-6 py-10 text-sm text-lawfare-text-secondary">{SAID.arriving}</p>}
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
