import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { ago, cents, plural } from './model/format.ts'
import type { Summary } from './model/conversations.ts'

/**
 * "Start over", and what it opens.
 *
 * The button is where it was and says what it said, because that is the thing in the band
 * a reader presses when they want to ask about something else. What changed is behind it:
 * pressing it no longer destroys the conversation on the screen. It shows what starting
 * over would set aside, offers the new conversation as the first thing in the panel, and
 * lists the ones already set aside so a reader can go back to an answer they paid for.
 *
 * On the app's kit rather than the Explorer's stylesheet, like every other control in the
 * band — and rendered from the header, which is outside `.explorer`, because the sheet's
 * own element rules would win over the kit's utilities inside it (see `ExplorerPage`).
 *
 * The one destructive thing here is "Forget", and it is a second press on a row that has
 * already said what it holds.
 */
export function Conversations({
  conversations,
  current,
  disabled,
  onNew,
  onOpen,
  onForget,
}: {
  conversations: readonly Summary[]
  current: string
  /** A turn is running: leaving would abandon it, so the doors are shut while it does. */
  disabled: boolean
  onNew(): void
  onOpen(cid: string): void
  onForget(cid: string): void
}) {
  const [open, setOpen] = useState(false)
  // Read when the panel opens, not from the page's clock: that one only ticks while a turn
  // is running, so on a tab left open since morning every row would say "3 min ago".
  const [now, setNow] = useState(() => Date.now())
  // Which row has asked to be forgotten. One at a time, and cleared whenever the panel
  // closes, so a confirmation never outlives the sight of what it would destroy.
  const [confirming, setConfirming] = useState<string | null>(null)
  const others = conversations.filter((c) => c.cid !== current)
  const here = conversations.find((c) => c.cid === current) ?? null

  function change(next: boolean) {
    setOpen(next)
    if (next) setNow(Date.now())
    else setConfirming(null)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => change(true)}>
        Start over
      </Button>
      <Sheet open={open} onOpenChange={change}>
        <SheetContent side="right" className="flex h-full flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription>
              {here
                ? 'Starting another one keeps this one. Nothing here is lost until you forget it.'
                : 'Ask something to start one. The ones you have had are below.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-border p-4">
              <Button
                type="button"
                className="w-full"
                disabled={disabled || (!here && !conversations.length)}
                onClick={() => {
                  onNew()
                  change(false)
                }}
              >
                New conversation
              </Button>
              {disabled && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A turn is running. It finishes first — what it spends is spent either way.
                </p>
              )}
            </div>

            {here && (
              <Row
                summary={here}
                now={now}
                open
                confirming={confirming === here.cid}
                onOpen={() => change(false)}
                onAskForget={() => setConfirming(here.cid)}
                onCancelForget={() => setConfirming(null)}
                onForget={() => {
                  setConfirming(null)
                  onForget(here.cid)
                  change(false)
                }}
              />
            )}

            {others.map((c) => (
              <Row
                key={c.cid}
                summary={c}
                now={now}
                open={false}
                confirming={confirming === c.cid}
                onOpen={() => {
                  onOpen(c.cid)
                  change(false)
                }}
                onAskForget={() => setConfirming(c.cid)}
                onCancelForget={() => setConfirming(null)}
                onForget={() => {
                  setConfirming(null)
                  onForget(c.cid)
                }}
              />
            ))}

            {!here && !others.length && (
              <p className="p-4 text-sm text-muted-foreground">
                Nothing yet. A conversation appears here as soon as you ask something.
              </p>
            )}
          </div>

          <div className="border-t border-border p-4 text-xs text-muted-foreground">
            These are on this device only — this browser, not your account. Clearing the
            browser&rsquo;s storage clears them.
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * One conversation: what it is about, and what it holds.
 *
 * The turns and the spend are the two things that decide whether it is worth going back
 * to, and they are the two things that make "Forget" a real choice rather than a reflex —
 * so they are on the row, not behind it.
 */
function Row({
  summary,
  now,
  open,
  confirming,
  onOpen,
  onAskForget,
  onCancelForget,
  onForget,
}: {
  summary: Summary
  now: number
  open: boolean
  confirming: boolean
  onOpen(): void
  onAskForget(): void
  onCancelForget(): void
  onForget(): void
}) {
  return (
    <div className={'border-b border-border p-4' + (open ? ' bg-muted/40' : '')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="flex-1 text-left"
          onClick={onOpen}
          aria-current={open ? 'true' : undefined}
        >
          <span className="block font-serif text-sm font-semibold text-foreground">
            {summary.title}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {open && <span className="font-medium text-foreground">open now · </span>}
            {plural(summary.turns, 'turn')} · {cents(summary.cents)} · {ago(summary.workedAt, now)}
          </span>
        </button>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onCancelForget}>
              Keep
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onForget}>
              Forget
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground"
            onClick={onAskForget}
            aria-label={`Forget “${summary.title}”`}
          >
            Forget
          </Button>
        )}
      </div>
    </div>
  )
}
