import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SiteBarActions } from '@/components/SiteBar'
import { usePaid } from '@/auth/use-paid'
import { readCarryoverQuery } from '@/lib/routing'
import { useAuth } from '@/lib/use-auth'
import type { AuthArg } from '@lawfare/ragtime-client'

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
 * Two parts, deliberately in two languages. The controls are the app's — the same
 * primitives every other surface uses (Button, the conversations sheet) — and they
 * are not on this page at all any more: they go up into the site's one bar through
 * `SiteBarActions`, so the Explorer opens on one bar rather than the brand strip plus
 * a band of its own. Everything under the bar is the Explorer as it was written — its
 * own markup and its own stylesheet, scoped under `.explorer` (explorer.css) — so the
 * conversation keeps its language while the question of whether to re-express it on
 * the kit stays open, one component at a time. Nothing of the kit goes inside
 * `.explorer`: the sheet's element rules would win over the kit's utilities there,
 * which is also why the controls render through a portal into the bar rather than
 * being drawn here.
 *
 * What the page no longer owns: the worker origin, where links open, and the
 * credential. `useAuth()` resolves the same union the turn is sent with — a signed-in
 * account, a bring-your-own Anthropic key, or the demo password from the access
 * dialog — and with none of them the composer waits rather than asking for a
 * password of its own.
 *
 * It does own one arrival: a question typed into the hub's box in Explorer mode comes
 * here on the URL (`?q=`), and what happens to it depends on whether anything can pay
 * for it. See {@link useCarriedQuestion}.
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
  // The hub's handoff: asked straight away when there is something to pay with,
  // left standing in the composer when there is not.
  const carried = useCarriedQuestion(credential, x.ask)
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
      {/* The band this page used to draw is gone into the site's one bar: the brand
          strip sat directly above it, so the Explorer opened on two bars. What is left
          of the band goes up through the bar's slot — the trail toggle and the
          conversations picker, which are controls over state that lives here and cannot
          be lifted anywhere. The title went with it: the bar's own Explorer link is
          `aria-current` on this route, so the page is named once. */}
      <SiteBarActions>
        {/* The page's one heading. The bar's Explorer link names this route for anyone
            reading the screen, and `aria-current` says it is where they are; a document
            still wants a heading, and this is it, said once and not drawn twice. */}
        <h1 className="sr-only">Explorer</h1>
        {/* Still the first thing after the lockup, and still hidden below `sm`: 390px is
            where that row runs out, and this is a marker rather than a control. */}
        <span className="hidden font-sans text-xs text-muted-foreground sm:inline">beta</span>
        {/* The phase pill was in the band too. It is gone rather than moved: at rest the
            empty state explains in prose what orient is and what it costs, and once there
            is a conversation every turn wears its own phase pill. */}
        <span className="flex-1" />
        {started && (
          <Button
            type="button"
            variant={trail.hot ? 'destructive' : 'outline'}
            size="sm"
            aria-expanded={trailOpen}
            aria-controls="trail"
            onClick={() => setTrailOpen((open) => !open)}
          >
            {/* Abbreviated below `sm`, like "AI access" and "Docs" either side of it.
                The two labels that only appear when a limit is close were also the two
                too wide for the row at 390, so the row wrapped at exactly the moment it
                had something to say. `attention` holds both wordings; which one is on
                screen is a question about the width. */}
            <span className="sm:hidden">{trail.short}</span>
            <span className="hidden sm:inline">{trail.label}</span>
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
      </SiteBarActions>

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
                  Use the access button in the bar above.
                </div>
              )}
              {/* The refusals with nowhere else to appear used to be a line of prose in
                  the band. A sentence is not bar content, so it comes down here instead —
                  above the composer, beside the credential line, which is where the reader
                  is standing when they read it. */}
              {refusal && (
                <div className="refusal" role="alert">
                  {refusal.message}
                </div>
              )}
              {/* The key is how a question that arrived after this mounted gets
                  into it. The composer reads its text once, at mount — which is
                  right, because it is the reader's own and nothing may overwrite
                  it mid-sentence — so a handoff that resolves a moment later
                  changes the key and the composer comes back up holding it. It
                  changes at most once in the life of the page, and never while
                  anything is typed in it. */}
              <Composer
                key={carried === null ? 'composer' : 'carried'}
                seed={carried ?? undefined}
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

/**
 * The question the hub's box was submitted with, and the one thing done with it.
 *
 * It arrives as `?q=` (`navigateTo('/explorer?q=…')` on the hub; `readCarryoverQuery`
 * here — the same pair of ends the spokes' keyword carryover already uses), and it is
 * handled exactly once, in one of two ways:
 *
 *   - **With a credential, it is asked.** The reader pressed send on the hub; making them
 *     press send again here would be the page asking twice for one decision.
 *   - **Without one, it waits in the composer.** Nothing may spend before there is
 *     something to spend, and the sign-in line under the box already says so. It is
 *     handed to the composer as its seed and the composer writes it to its own draft key
 *     from there, so the question survives the reader leaving to set up access and coming
 *     back. It wins over an older draft on purpose: a sentence typed seconds ago on the
 *     hub is the live intent, and the stale one behind it is not.
 *
 * Three things are load-bearing and each has a failure it prevents:
 *
 *   - **The ref, not the effect's dependency list, is what makes it once.** React's
 *     StrictMode mounts, unmounts and remounts every component in development, and a
 *     turn costs real money; `handled` survives that, and `ask` firing twice would be
 *     two charges for one question.
 *   - **`?q=` is taken out of the address as soon as it is handled.** Otherwise a reload
 *     — or Back, later — would be a fresh page with the same question on it, and it
 *     would ask again. The question lives in the conversation now; the URL was only the
 *     way it travelled.
 *   - **The no-credential branch waits for `usePaid().ready`.** A signed-in session is
 *     read off the device asynchronously, so for the first moments after a cold load
 *     `auth` is null for a reader who is not signed out at all. Deciding then would send
 *     a paying reader's question to the composer to sit behind a sign-in line they do not
 *     need. Every other credential (a key, the demo password) is read synchronously, so
 *     this is the only wait there is.
 *
 * Returns the question the composer should open holding, or null — which is every case
 * but that one, including the case where it was asked.
 */
function useCarriedQuestion(
  credential: AuthArg | null,
  ask: (text: string) => Promise<void>,
): string | null {
  // Read at the first render, before anything can strip it, and pure — StrictMode calls
  // an initializer twice and a read with a side effect in it would not survive that.
  const [carried] = useState(readCarryoverQuery)
  const { ready: sessionSettled } = usePaid()
  const handled = useRef(false)
  const [waiting, setWaiting] = useState<string | null>(null)

  useEffect(() => {
    if (!carried || handled.current) return
    if (!credential && !sessionSettled) return
    handled.current = true
    if (credential) void ask(carried)
    else setWaiting(carried)
    const url = new URL(window.location.href)
    url.searchParams.delete('q')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [carried, credential, sessionSettled, ask])

  return waiting
}
