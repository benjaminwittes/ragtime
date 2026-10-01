import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AppLink } from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { slideAfter, type DemoView, type Slide } from './kit.ts'
import { KitMarkdown, Locked, SlideFace } from './parts.tsx'
import { PROSE } from './prose.ts'
import { useKit } from './useKit.ts'

/** The words. */
const SAID = {
  loading: 'Opening…',
  locked: 'This page is for the people presenting.',
  wrong: 'That passphrase does not open this.',
  unreadable: 'This kit was sealed in a format this page cannot read. Reload, and if that does not help, tell whoever sent the link.',
  missing: 'There is no kit here right now.',
  guide: 'Guide',
  deck: 'Deck',
  stage: 'Present live',
  present: 'Present',
  notes: 'Notes',
  noNotes: 'No notes for this slide.',
  keys: '← → move · F full screen · N notes',
  forget: 'Lock this page on this device',
} as const

/**
 * The presenter's kit: a guide and a deck, for the people giving a demo.
 *
 * Internal, and this app has no server to make it so — it is a static site built from a
 * public repository. So the kit is served sealed (`scripts/seal-kit.mjs`) and opened here,
 * in the browser, with a passphrase the link carries in its fragment: `/demo#k=…`. One
 * link, no sign-in, and neither the words nor the passphrase ever reach a server
 * (`useKit.ts` is the opening; `/present` opens the same kit the same way).
 */
export function DemoPage({ view }: { view: DemoView }) {
  const { state, tryPassphrase, forget } = useKit()

  if (state.at !== 'open') {
    return (
      <main className="min-h-[60vh] bg-lawfare-paper text-foreground">
        <div className="mx-auto max-w-md px-6 py-20">
          {state.at === 'loading' && <p className="text-sm text-lawfare-text-secondary">{SAID.loading}</p>}
          {state.at === 'missing' && <p className="text-sm text-lawfare-text-secondary">{SAID.missing}</p>}
          {state.at === 'locked' && (
            <Locked title={SAID.locked} said={state.why === null ? null : SAID[state.why]} onTry={tryPassphrase} />
          )}
        </div>
      </main>
    )
  }

  const { kit } = state
  return (
    // `data-stage-skip`: a presenter who is live may come here to read the guide, and the
    // room must not be shown it (`stage/mirror.ts`).
    <main className="min-h-screen bg-lawfare-paper text-foreground" data-demo={view} data-stage-skip="">
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-lawfare-line py-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-medium tracking-tight">{kit.title}</h1>
            <p className="text-sm text-lawfare-text-secondary">{kit.when}</p>
          </div>
          <nav className="flex items-baseline gap-5 font-serif text-lg" aria-label="Kit">
            <Face to="/demo" current={view === 'guide'}>
              {SAID.guide}
            </Face>
            <Face to="/demo/deck" current={view === 'deck'}>
              {SAID.deck}
            </Face>
            {/* Only a kit sealed with a signing key can drive the stage. */}
            {kit.stage && (
              <Face to="/present" current={false}>
                {SAID.stage}
              </Face>
            )}
          </nav>
        </header>

        {view === 'guide' ? (
          <article className="mx-auto max-w-3xl py-8">
            <KitMarkdown className={PROSE}>{kit.guide}</KitMarkdown>
            <p className="mt-12 border-t border-lawfare-line pt-4 text-xs text-lawfare-muted">
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={forget}>
                {SAID.forget}
              </button>
            </p>
          </article>
        ) : (
          <Deck slides={kit.slides} />
        )}
      </div>
    </main>
  )
}

function Face({ to, current, children }: { to: string; current: boolean; children: ReactNode }) {
  return (
    <AppLink
      to={to}
      aria-current={current ? 'page' : undefined}
      className="border-b-2 border-transparent pb-0.5 text-lawfare-text-secondary hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
    >
      {children}
    </AppLink>
  )
}

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

/** The slide a reload should come back to: `#s=<n>`, one-based, as a presenter counts. */
function slideInHash(count: number): number {
  const n = Number(new URLSearchParams(window.location.hash.replace(/^#/, '')).get('s'))
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0
}

/**
 * The deck: one slide on a 16:9 stage, the notes and the running order under it.
 *
 * Full screen takes the stage alone, so what the room sees is the slide and nothing a
 * presenter reads from. The notes are for rehearsal and for a second window; the guide is
 * what a presenter keeps beside them on the day.
 */
function Deck({ slides }: { slides: Slide[] }) {
  const [at, setAt] = useState(() => slideInHash(slides.length))
  const [notes, setNotes] = useState(true)
  const [full, setFull] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  // The key handler reads where the deck is from a ref, not from the closure and not from
  // a state updater: it has to decide *during the event* whether the key was its own, so
  // that Space moves a slide instead of scrolling the page, and an updater runs too late
  // to call `preventDefault`.
  const here = useRef(at)
  useEffect(() => {
    here.current = at
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#s=${at + 1}`)
  }, [at])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void stage.current?.requestFullscreen?.()
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        setNotes((shown) => !shown)
        return
      }
      const next = slideAfter(event.key, here.current, slides.length)
      if (next === here.current) return
      event.preventDefault()
      setAt(next)
    }
    const onFull = () => setFull(document.fullscreenElement === stage.current)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [slides.length])

  const slide = slides[at]
  if (!slide) return null
  return (
    <div className="py-6">
      {/* The full-screen element is this wrapper, not the slide: full screen stretches
          its element to the display, and a 16:9 slide on a 16:10 laptop needs something
          around it to be centred in. */}
      <div
        ref={stage}
        className={cn('flex items-center justify-center', full && 'bg-lawfare-paper')}
        data-demo="stage"
      >
        <SlideFace
          slide={slide}
          at={at}
          of={slides.length}
          style={full ? { width: 'min(100vw, calc(100vh * 16 / 9))' } : undefined}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) return
            const box = event.currentTarget.getBoundingClientRect()
            const forward = event.clientX - box.left > box.width / 3
            setAt((here) => slideAfter(forward ? 'ArrowRight' : 'ArrowLeft', here, slides.length))
          }}
          className={cn('cursor-pointer', !full && 'rounded-md border border-lawfare-line-strong shadow-sm')}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-lawfare-muted">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAt((here) => slideAfter('ArrowLeft', here, slides.length))}
          disabled={at === 0}
        >
          ←
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAt((here) => slideAfter('ArrowRight', here, slides.length))}
          disabled={at === slides.length - 1}
        >
          →
        </Button>
        <Button size="sm" onClick={() => void stage.current?.requestFullscreen?.()}>
          {SAID.present}
        </Button>
        <span>{SAID.keys}</span>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_18rem]">
        <section aria-label={SAID.notes}>
          <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-lawfare-muted">
            {SAID.notes}
          </h3>
          {notes &&
            (slide.notes ? (
              <KitMarkdown className={cn('mt-1', PROSE)}>{slide.notes}</KitMarkdown>
            ) : (
              <p className="mt-2 text-sm text-lawfare-muted">{SAID.noNotes}</p>
            ))}
        </section>
        <ol className="grid content-start gap-0.5 text-sm">
          {slides.map((each, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => setAt(index)}
                aria-current={index === at ? 'true' : undefined}
                className="flex w-full gap-2 rounded px-2 py-1 text-left text-lawfare-text-secondary hover:bg-muted aria-[current=true]:bg-lawfare-teal-bg aria-[current=true]:text-foreground"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-lawfare-muted">{index + 1}</span>
                <span className="min-w-0 truncate">{each.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
