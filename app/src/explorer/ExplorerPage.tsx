import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { useAuth } from '@/lib/use-auth'
import { AccessSettings } from '@/llm/AccessSettings'

import { DAILY_MODEL_CALLS, WORKER_URL } from './config.ts'
import { useExplorer } from './hooks/useExplorer.ts'
import { QUOTA_CODES, allowance } from './model/allowance.ts'
import { plural } from './model/format.ts'
import { conversationCost, toolCalls } from './model/turn.ts'
import { Allowance } from './components/Allowance.tsx'
import { BriefCard } from './components/BriefCard.tsx'
import { Composer } from './components/Composer.tsx'
import { Conversation } from './components/Conversation.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { Meter } from './components/Meter.tsx'
import { Point } from './components/Point.tsx'
import { Trail } from './components/Trail.tsx'

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
  const pool = allowance({
    cost: conversationCost(x.turns),
    fallbackCap: DAILY_MODEL_CALLS,
    shared: false,
    refusalCode: x.refusal?.code ?? null,
  })
  const calls = toolCalls(x.turns)

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
  // exhausted allowance turns the Allowance panel red and stops the turn with its own
  // error block. What is left — no credential, a bad envelope, a network that dropped —
  // has nowhere else to appear.
  const refusal = x.refusal && x.refusal.code !== 'cap_cents' && !QUOTA_CODES.has(x.refusal.code ?? '') ? x.refusal : null

  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            Explorer <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">beta</span>
          </h1>
          <span className="rounded-full bg-lawfare-teal-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-lawfare-teal">
            {x.phase}
          </span>
          <span className="flex-1" />
          {refusal && (
            <span className="text-sm text-destructive" role="alert">
              {refusal.message}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={x.startOver} disabled={!x.turns.length}>
            Start over
          </Button>
          <AccessSettings />
          <DocsTrigger />
        </div>
      </header>

      <div className="explorer">
        <div className="app">
          {/* The meter and the allowance are what a member must not have to go looking
              for, so they sit across the top where they are read at a glance and cost
              the answer no width. The trail is the page's argument that it shows its
              work, which is not the same as the work being on the screen: closed, it is
              one line here saying how much is behind it — the count is what makes it
              worth a tap. Open it and the rail comes back. */}
          <div className="strip">
            <Meter turns={x.turns} phase={x.phase} totalCalls={x.totalCalls} />
            {!isPaid && <Allowance value={pool} conversationCalls={x.totalCalls} />}
            <button
              type="button"
              className={'trail-toggle' + (trailOpen ? ' on' : '')}
              aria-expanded={trailOpen}
              aria-controls="trail"
              onClick={() => setTrailOpen((open) => !open)}
            >
              <span aria-hidden="true">{trailOpen ? '▾' : '▸'}</span>{' '}
              Trail{calls > 0 ? ' — ' + plural(calls, 'tool call') : ' — every tool call and what it cost'}
            </button>
          </div>

          <main className={'main' + (trailOpen ? ' with-trail' : '')}>
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
                  <EmptyState registry={x.registry} pinned={x.pinned} disabled={x.busy || waiting} onAsk={x.ask} onTogglePin={x.togglePin} />
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
            {trailOpen && (
              <aside className="right" id="trail">
                <div className="scroll">
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
