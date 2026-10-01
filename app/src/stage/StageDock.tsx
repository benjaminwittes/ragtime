import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { AppLink } from '@/components/AppLink'
import { openKept } from '@/demo/useKit'

import { arm, dismissYielded, goLive, setShowApp, stop, wasPresenting } from './presenter.ts'
import { usePresenter } from './useStage.ts'

/** The words. */
const SAID = {
  thisPage: 'On stage: this page',
  holding: (n: number) => `The stage is holding slide ${n}`,
  holdingFigure: 'The stage is holding the figure',
  hold: 'Hold the slide',
  show: 'Show this page',
  slides: 'Slides',
  stop: 'Stop',
  audience: (n: number) => `${n} watching`,
  taken: (who: string) => `${who || 'Someone else'} has taken the stage.`,
  takeBack: 'Take it back',
  dismiss: 'Dismiss',
} as const

/**
 * The presenter's dock: the piece of the console that follows them into the app.
 *
 * A presenter who leaves `/present` is showing the room the page they are on. That has
 * to be impossible to forget, so it is said at the bottom of every page for as long as it
 * is true — along with the way to stop it being true (hold the slide instead), and the
 * way back to the slides.
 *
 * Mounted once in `App`, beside the route, for the tour's reason: it crosses routes.
 * Marked `data-stage-skip`, so the room never sees it (`mirror.ts`).
 *
 * It is also what picks a presentation back up after a reload: a tab that was live says
 * so in its session storage, and this re-opens the kit with the passphrase the device
 * kept and carries on, on whatever page the reload happened.
 */
export function StageDock() {
  const presenter = usePresenter()

  useEffect(() => {
    if (!wasPresenting()) return
    let cancelled = false
    void openKept().then((opened) => {
      if (opened && !cancelled) void arm(opened.kit, opened.sealed)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!presenter.armed || presenter.onConsole || (!presenter.live && !presenter.yielded)) return null

  const holding =
    presenter.face.kind === 'figure' ? SAID.holdingFigure : SAID.holding(presenter.at + 1)

  return createPortal(
    <div
      data-stage-skip=""
      data-stage="dock"
      role="region"
      aria-label="Presenting"
      className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-lawfare-line-strong bg-foreground px-4 py-2 text-[13px] text-background shadow-lg"
    >
      {presenter.live ? (
        <>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
            {presenter.showApp && !presenter.backstage ? SAID.thisPage : holding}
          </span>
          <span className="tabular-nums opacity-70">{SAID.audience(presenter.audience)}</span>
          {/* Backstage — the guide, the deck — there is no choice to offer: this page is
              never shown. */}
          {!presenter.backstage && (
            <button type="button" className="underline underline-offset-2" onClick={() => setShowApp(!presenter.showApp)}>
              {presenter.showApp ? SAID.hold : SAID.show}
            </button>
          )}
          <AppLink to="/present" className="underline underline-offset-2">
            {SAID.slides}
          </AppLink>
          <button type="button" className="underline underline-offset-2 opacity-70 hover:opacity-100" onClick={stop}>
            {SAID.stop}
          </button>
        </>
      ) : (
        <>
          <span className="font-semibold">{SAID.taken(presenter.other?.who ?? '')}</span>
          <button type="button" className="underline underline-offset-2" onClick={goLive}>
            {SAID.takeBack}
          </button>
          <button type="button" className="underline underline-offset-2 opacity-70 hover:opacity-100" onClick={dismissYielded}>
            {SAID.dismiss}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
