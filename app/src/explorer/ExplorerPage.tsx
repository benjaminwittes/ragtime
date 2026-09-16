import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { useAuth } from '@/lib/use-auth'
import { AccessSettings } from '@/llm/AccessSettings'

import { DAILY_MODEL_CALLS, WORKER_URL } from './config.ts'
import { useExplorer } from './hooks/useExplorer.ts'
import { QUOTA_CODES, allowance } from './model/allowance.ts'
import { attention } from './model/attention.ts'
import { conversationCost } from './model/turn.ts'
import { Allowance } from './components/Allowance.tsx'
import { BriefCard } from './components/BriefCard.tsx'
import { Composer } from './components/Composer.tsx'
import { Conversation } from './components/Conversation.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { Meter } from './components/Meter.tsx'
import { Point } from './components/Point.tsx'
import { Trail } from './components/Trail.tsx'
import { Conversations } from './Conversations.tsx'

/**
 * `/explorer` — the Explorer as a page of this app.
 *
 * Two parts, deliberately in two languages. The band at the top is the app's: the
 * same primitives every spoke header uses (AccessSettings, DocsTrigger, Button), so
 * the credential, the docs and "start over" look and behave as they do everywhere
 * else on the site. Everything under it is the Explorer as it was written — its own
 * markup and its own stylesheet, scoped under `.explorer` (explorer.css) — so the
 * conversation keeps its language while the question of whether to re-express it on
 * the kit stays open, one component at a time. Nothing of the kit goes inside
 * `.explorer`: the sheet's element rules would win over the kit's utilities there.
 *
 * What the page no longer owns: the worker origin, where links open, and the
 * credential. `useAuth()` resolves the same union the turn is sent with — a signed-in
 * account, a bring-your-own Anthropic key, or the demo password from the access
 * dialog — and with none of them the composer waits rather than asking for a
 * password of its own.
 */
export function ExplorerPage() {
  const { auth, isPaid } = useAuth()
  // The Explorer runs on Claude. A key for another provider is a credential the worker
  // would refuse on the first turn, so the page says so before one is sent.
  const wrongProvider = auth?.mode === 'byok' && auth.provider !== 'anthropic'
  const credential = wrongProvider ? null : auth
  const waiting = !credential
  // Closed on every viewport, which is a plain default and not a breakpoint: this is the
  // reader's own toggle, so it is component state.
  const [trailOpen, setTrailOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const x = useExplorer({ workerUrl: WORKER_URL, auth: credential })
  // The daily allowance is the visitor's own network's (nothing here is mounted behind
  // a shared gate). A paid account is metered on its balance and has no such pool, so
  // the panel is not shown to it.
  const cost = conversationCost(x.turns)
  const pool = allowance({
    cost,
    fallbackCap: DAILY_MODEL_CALLS,
    shared: false,
    refusalCode: x.refusal?.code ?? null,
  })
  // Nothing is on the screen at rest, so the trail control is the one thing that can ask
  // to be looked at. `attention` holds the whole rule for when it does.
  const trail = attention({
    spendCents: cost ? cost.conversation_spend : 0,
    capCents: cost ? cost.cap_cents : 25,
    pool: isPaid ? null : pool,
  })
  // Both of these are controls on a conversation, so neither exists before there is one.
  // "Start over" used to render disabled from the first paint, which is a button teaching
  // a reader nothing at the moment they have the least room for it.
  const started = x.turns.length > 0
  // Derived rather than taken from `trailOpen` directly, so no future caller can empty the
  // turns and leave the panel up: below 900px an open trail hides the conversation, and
  // the control that closes it only exists while there is a conversation to close it for.
  const showTrail = started && trailOpen

  // A one-second clock for the running turn's elapsed time; idle otherwise. A finished
  // turn reads its own `endedAt` (`elapsedMs`), so the clock need not be reset for it.
  useEffect(() => {
    if (!x.busy) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [x.busy])

  const placeholder = waiting
    ? wrongProvider
      ? 'The Explorer runs on Claude — choose an Anthropic key or sign in to ask'
      : 'Sign in, add an Anthropic key, or enter the demo password to ask'
    : x.awaitingReply
      ? 'Reply to the question'
      : x.phase === 'research'
        ? 'Ask a follow-up — same brief; edit the brief above for a new one'
        : 'What do you want to know? Orient decides how to research it before anything spends.'

  // A refusal the page already renders somewhere it is being looked at is not worth a
  // third copy in the band: the conversation cap wears a badge on the answer, and an
  // exhausted allowance stops the turn with its own error block — which is now the only
  // place it is said in prose, since the Allowance panel that used to turn red is behind
  // the trail. It is still said twice: the trail control reads "Allowance used up" and
  // goes hot without being opened. What is left — no credential, a bad envelope, a
  // network that dropped — has nowhere else to appear.
  const refusal = x.refusal && x.refusal.code !== 'cap_cents' && !QUOTA_CODES.has(x.refusal.code ?? '') ? x.refusal : null

  return (
    <>
      <header className="border-b border-border bg-card">
        {/* Tighter at phone width than anywhere else, because 390px is where this row
            runs out. Measured with a conversation open — so with Trail and Start over in
            it — the band wrapped to a second row and cost 146px of 844 instead of 110.
            The gap, the padding and the word "beta" below are what buy the row back. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 sm:gap-x-4 sm:px-6">
          {/* Sized down a step on a phone, where the band is competing with the question
              for the top of the screen and 390px does not have room for both at full size. */}
          <h1 className="font-serif text-lg font-bold tracking-tight text-foreground sm:text-2xl">
            Explorer <span className="ml-1 hidden font-sans text-xs font-normal text-muted-foreground sm:inline">beta</span>
          </h1>
          {/* The phase pill was here too. It is gone rather than moved: at rest the empty
              state explains in prose what orient is and what it costs, and once there is a
              conversation every turn wears its own phase pill. Between the two there was no
              moment it was the only thing saying so — and on a phone it was the width that
              wrapped the band onto a second row. */}
          <span className="flex-1" />
          {refusal && (
            <span className="text-sm text-destructive" role="alert">
              {refusal.message}
            </span>
          )}
          {started && (
            <Button
              type="button"
              variant={trail.hot ? 'destructive' : 'outline'}
              size="sm"
              aria-expanded={trailOpen}
              aria-controls="trail"
              onClick={() => setTrailOpen((open) => !open)}
            >
              {trail.label}
            </Button>
          )}
          {(started || x.conversations.length > 0) && (
            <Conversations
              conversations={x.conversations}
              current={x.cid}
              disabled={x.busy}
              onNew={() => {
                // Closing the trail is not tidiness, it is the way back. A new
                // conversation empties the turns, which unmounts the control above — and
                // below 900px an open trail hides the conversation, so leaving it open
                // would strand the reader on an empty panel with nothing left to press.
                setTrailOpen(false)
                x.startNew()
              }}
              onOpen={(cid) => {
                setTrailOpen(false)
                x.open(cid)
              }}
              onForget={(cid) => {
                setTrailOpen(false)
                x.forget(cid)
              }}
            />
          )}
          <AccessSettings />
          <DocsTrigger />
        </div>
      </header>

      <div className="explorer">
        <div className="app">
          {/* There is no strip. The meter, the daily allowance and the trail toggle used
              to sit across the top of every page view; measured on a phone that was about
              250px of 844 spent before the reader had asked anything, on three numbers
              they had not asked for. They are all inside the trail now — one control in
              the band above, one place for every number — and the control says so when a
              limit is close (`attention`). This is the reversal of the argument the strip
              was built on, which was that a limit nobody sees until it bites is not on the
              screen; the answer is that it is on the screen at the two moments it means
              something, rather than at all of them. */}
          <main className={'main' + (showTrail ? ' with-trail' : '')}>
            <section className="left">
              {x.brief && (
                <div className="brief-bar">
                  <BriefCard
                    brief={x.brief}
                    registry={x.registry}
                    editable={false}
                    accepted={x.brief}
                    disabled={x.busy}
                    startOpen={false}
                    onAccept={x.accept}
                  />
                </div>
              )}
              <div className="scroll">
                {x.turns.length === 0 ? (
                  <EmptyState registry={x.registry} pinned={x.pinned} disabled={x.busy || waiting} busy={x.busy} onAsk={x.ask} onTogglePin={x.togglePin} />
                ) : (
                  <Conversation
                    turns={x.turns}
                    brief={x.brief}
                    proposed={x.proposed}
                    registry={x.registry}
                    now={now}
                    busy={x.busy}
                    onAccept={x.accept}
                  />
                )}
              </div>
              {waiting && (
                <div className="credential" role="status">
                  {wrongProvider ? 'The Explorer runs on Claude. ' : 'Nothing spends until you are signed in or have a key set. '}
                  Use the access button in the band above.
                </div>
              )}
              <Composer
                placeholder={placeholder}
                disabled={x.busy || waiting || (x.phase === 'orient' && !!x.proposed && !x.awaitingReply)}
                focusKey={x.turns.filter((t) => t.question).length}
                onSend={x.ask}
              />
            </section>
            {showTrail && (
              <aside className="right" id="trail">
                <div className="scroll">
                  {/* The numbers first, then the work they are the total of. Below 900px
                      this panel replaces the conversation rather than sitting beside it,
                      so what is here costs the answer nothing. */}
                  <Meter turns={x.turns} />
                  {!isPaid && <Allowance value={pool} />}
                  <Trail turns={x.turns} />
                </div>
              </aside>
            )}
          </main>

          <Point />
        </div>
      </div>
    </>
  )
}
