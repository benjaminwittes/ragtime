import { useEffect, useRef, useState } from 'react'

import { AppLink } from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { slideAfter } from '@/demo/kit'
import { KitMarkdown, Locked, SlideFace } from '@/demo/parts'
import { PROSE } from '@/demo/prose'
import { useKit } from '@/demo/useKit'
import { navigateTo, toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'

import { FigureByName } from './FigureByName.tsx'
import { FIGURES } from './figures.ts'
import { arm, goLive, goTo, presenterKit, setShowApp, setWho, showFace, stop } from './presenter.ts'
import { usePresenter } from './useStage.ts'

/** The words. */
const SAID = {
  loading: 'Opening…',
  locked: 'This page is for the people presenting.',
  wrong: 'That passphrase does not open this.',
  unreadable: 'This kit was sealed in a format this page cannot read. Reload, and if that does not help, tell whoever sent the link.',
  missing: 'There is no kit here right now.',
  old: 'This kit was sealed before the stage existed, so it cannot present. Seal it again and reload.',
  quiet: 'The stage is quiet.',
  live: 'You are live.',
  goLive: 'Go live',
  takeOver: 'Take the stage',
  stop: 'Stop',
  audience: (n: number) => (n === 1 ? '1 person on the stage' : `${n} people on the stage`),
  other: (who: string) => `${who || 'Someone else'} is presenting.`,
  offline: 'Not connected yet: only windows in this browser are following.',
  as: 'Your name (optional)',
  where: 'The audience goes to',
  copy: 'Copy',
  copied: 'Copied',
  open: 'Open the stage',
  onStage: 'On stage',
  showApp: 'Show the app',
  showAppMore: 'The stage follows you into the app, and comes back to this slide when you come back here.',
  figures: 'Figures',
  backToSlide: 'Back to the slide',
  notes: 'Notes',
  noNotes: 'No notes for this slide.',
  keys: '← → move',
} as const

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

/**
 * The presenter's console: what is on stage, what comes next, and what to say.
 *
 * Opened by the same passphrase as the kit, because it *is* the kit — the deck and its
 * notes — with the stage attached. Anyone who has the passphrase can present, and the
 * presenters can hand the stage to each other: going live takes it from whoever had it.
 *
 * The console does not hold the presentation; the tab does (`presenter.ts`). Leaving this
 * page for the app is how the app is shown, and the dock that follows (`StageDock`) is
 * how to come back.
 */
export function PresentPage() {
  const { state, tryPassphrase } = useKit()
  const presenter = usePresenter()
  const [refused, setRefused] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state.at !== 'open') return
    let cancelled = false
    void arm(state.kit, state.sealed).then((ok) => {
      if (!cancelled) setRefused(!ok)
    })
    return () => {
      cancelled = true
    }
  }, [state])

  // Read from a ref for the reason the deck gives: the handler has to know during the
  // event whether the key moved a slide, to keep Space from scrolling the page.
  const here = useRef(presenter.at)
  useEffect(() => {
    here.current = presenter.at
  }, [presenter.at])
  const count = presenterKit()?.slides.length ?? 0
  useEffect(() => {
    if (!presenter.armed) return
    const onKey = (event: KeyboardEvent) => {
      if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const next = slideAfter(event.key, here.current, count)
      if (next === here.current) return
      event.preventDefault()
      goTo(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenter.armed, count])

  const kit = presenterKit()
  if (state.at !== 'open' || refused || !presenter.armed || !kit) {
    return (
      <main className="min-h-[60vh] bg-lawfare-paper text-foreground">
        <div className="mx-auto max-w-md px-6 py-20">
          {state.at === 'missing' && <p className="text-sm text-lawfare-text-secondary">{SAID.missing}</p>}
          {state.at === 'locked' && (
            <Locked title={SAID.locked} said={state.why === null ? null : SAID[state.why]} onTry={tryPassphrase} />
          )}
          {state.at === 'open' && refused && <p className="text-sm text-lawfare-text-secondary">{SAID.old}</p>}
          {(state.at === 'loading' || (state.at === 'open' && !refused)) && (
            <p className="text-sm text-lawfare-text-secondary">{SAID.loading}</p>
          )}
        </div>
      </main>
    )
  }

  const slide = kit.slides[presenter.at]
  const stageUrl = window.location.origin + toHref('/stage')
  const figure = presenter.face.kind === 'figure' ? presenter.face.name : null

  return (
    // `data-stage-skip`: the notes are on this page. The stage never shows it — being
    // here means the stage is on a slide — and this makes that true of every frame,
    // including one taken in the instant between leaving and the next page arriving.
    <main
      className="min-h-screen bg-lawfare-paper text-foreground"
      data-present={presenter.live ? 'live' : 'ready'}
      data-stage-skip=""
    >
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-lawfare-line py-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-medium tracking-tight">{kit.title}</h1>
            <p className="text-sm text-lawfare-text-secondary" role="status" data-present="status">
              {presenter.live ? (
                <>
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-red-600 align-middle" aria-hidden="true" />
                  <strong className="font-semibold text-foreground">{SAID.live}</strong> {SAID.audience(presenter.audience)}
                </>
              ) : presenter.other ? (
                SAID.other(presenter.other.who)
              ) : (
                SAID.quiet
              )}
              {!presenter.joined && <span className="ml-2 text-lawfare-muted">{SAID.offline}</span>}
            </p>
          </div>
          <input
            value={presenter.who}
            onChange={(event) => setWho(event.target.value.slice(0, 40))}
            placeholder={SAID.as}
            aria-label={SAID.as}
            className="w-56 rounded-md border border-lawfare-line-strong bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {presenter.live ? (
            <Button variant="outline" onClick={stop}>
              {SAID.stop}
            </Button>
          ) : (
            <Button onClick={goLive}>{presenter.other ? SAID.takeOver : SAID.goLive}</Button>
          )}
        </header>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-lawfare-text-secondary">
          <span>{SAID.where}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">{stageUrl}</code>
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => {
              void navigator.clipboard?.writeText(stageUrl).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1_500)
              })
            }}
          >
            {copied ? SAID.copied : SAID.copy}
          </button>
          <a href={toHref('/stage')} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            {SAID.open}
          </a>
          <span className="ml-auto text-xs text-lawfare-muted">
            <AppLink to="/demo" className="underline underline-offset-2 hover:text-foreground">
              Guide
            </AppLink>
          </span>
        </p>

        <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
          <div>
            <p className="mb-1.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-lawfare-muted">
              {SAID.onStage}
            </p>
            {figure === null ? (
              slide && (
                <SlideFace
                  slide={slide}
                  at={presenter.at}
                  of={kit.slides.length}
                  className="rounded-md border border-lawfare-line-strong shadow-sm"
                />
              )
            ) : (
              <section className="flex aspect-video flex-col rounded-md border border-lawfare-line-strong bg-card px-[5cqw] py-[4cqw] shadow-sm [container-type:inline-size]">
                <h2 className="mb-[2cqw] font-serif text-[3.4cqw] font-medium leading-tight tracking-tight">
                  {FIGURES[figure]?.title}
                </h2>
                <div className="min-h-0 flex-1">
                  <FigureByName name={figure} />
                </div>
              </section>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-lawfare-muted">
              <Button variant="outline" size="sm" onClick={() => goTo(presenter.at - 1)} disabled={presenter.at === 0 && figure === null}>
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goTo(presenter.at + 1)}
                disabled={presenter.at === kit.slides.length - 1 && figure === null}
              >
                →
              </Button>
              <span>{SAID.keys}</span>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                title={SAID.showAppMore}
                onClick={() => {
                  setShowApp(true)
                  navigateTo('/')
                }}
              >
                {SAID.showApp} →
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-lawfare-muted">
                {SAID.figures}
              </span>
              {Object.entries(FIGURES).map(([name, entry]) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={figure === name}
                  onClick={() => showFace({ kind: 'figure', name })}
                  className="rounded border border-lawfare-line-strong px-2 py-0.5 text-lawfare-text-secondary hover:border-primary hover:text-foreground aria-pressed:border-primary aria-pressed:bg-lawfare-teal-bg aria-pressed:text-foreground"
                >
                  {entry.title}
                </button>
              ))}
              {figure !== null && (
                <button type="button" className="text-primary underline underline-offset-2" onClick={() => showFace({ kind: 'slide' })}>
                  {SAID.backToSlide}
                </button>
              )}
            </div>

            <section aria-label={SAID.notes} className="mt-6">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-lawfare-muted">{SAID.notes}</h3>
              {slide?.notes ? (
                <KitMarkdown className={cn('mt-1', PROSE)}>{slide.notes}</KitMarkdown>
              ) : (
                <p className="mt-2 text-sm text-lawfare-muted">{SAID.noNotes}</p>
              )}
            </section>
          </div>

          <ol className="grid content-start gap-0.5 text-sm">
            {kit.slides.map((each, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === presenter.at && figure === null ? 'true' : undefined}
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
    </main>
  )
}
