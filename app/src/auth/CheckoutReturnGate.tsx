import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePaid } from './use-paid'

/**
 * Post-checkout return UX.
 *
 * On app mount, reads `?checkout=success|cancel` from the URL. If present,
 * strips the param from history (so reloads don't replay), then:
 *
 *   - `success`: shows a "Processing top-up…" modal and polls /api/balance
 *     until the balance is higher than it was pre-checkout (= the Stripe
 *     webhook has fired and credited). Flips to a "Topped up" confirmation
 *     on success, "still processing" if the poll times out.
 *
 *   - `cancel`: shows a brief "Checkout cancelled" confirmation.
 *
 * Polling tunables: a snapshot of the balance at first run is the
 * "pre-checkout" reference; every ~2.5s we re-fetch via the paid context's
 * `refreshBalance()` and compare. Bail after 30 attempts (~75 seconds) —
 * past that, the webhook is almost certainly delayed (or failed) and the
 * user should retry or contact support.
 *
 * Renders nothing in the steady-state case (no checkout param).
 */

const POLL_INTERVAL_MS = 2_500
const POLL_MAX_ATTEMPTS = 30

type ReturnState =
  | { kind: 'idle' }
  | { kind: 'processing'; baselineCents: number; attempts: number }
  | { kind: 'success'; deltaCents: number }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }

export function CheckoutReturnGate() {
  const paid = usePaid()
  const [state, setState] = useState<ReturnState>({ kind: 'idle' })

  // Read the URL exactly once on mount. We don't react to navigation
  // changes — this is specifically a checkout-return signal, which only
  // appears as a top-level browser redirect. The setState calls are an
  // external-sync pattern (URL → React state); the lint rule's general
  // caution against it doesn't apply here.
  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get('checkout')
    if (result !== 'success' && result !== 'cancel') return
    // Strip the checkout param + session_id so reloads don't replay.
    url.searchParams.delete('checkout')
    url.searchParams.delete('session_id')
    const clean = url.pathname + (url.search || '') + (url.hash || '')
    window.history.replaceState(null, '', clean)

    if (result === 'cancel') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'cancelled' })
      return
    }
    // Success path. Capture the current balance as the baseline — even if
    // the webhook fires before we mount, the polled balance will be
    // strictly greater, which is exactly the signal we want.
    const baseline = paid.account?.balance_cents ?? 0
    setState({ kind: 'processing', baselineCents: baseline, attempts: 0 })
  }, [paid.account])

  // Drive the polling loop while in the processing state.
  //
  // Depend on `refreshBalance` (a stable useCallback) and the specific
  // state fields we read — NOT the whole `paid` context, which changes
  // identity on every internal state update (balanceLoading toggling,
  // account refreshing) and would otherwise re-fire the effect mid-poll
  // and create overlapping timers.
  const { refreshBalance } = paid
  useEffect(() => {
    if (state.kind !== 'processing') return
    const { baselineCents, attempts } = state
    let cancelled = false
    const id = window.setTimeout(async () => {
      if (cancelled) return
      const fresh = await refreshBalance()
      if (cancelled) return
      if (fresh && fresh.balance_cents > baselineCents) {
        setState({
          kind: 'success',
          deltaCents: fresh.balance_cents - baselineCents,
        })
        return
      }
      if (attempts + 1 >= POLL_MAX_ATTEMPTS) {
        setState({ kind: 'timeout' })
        return
      }
      setState({
        kind: 'processing',
        baselineCents,
        attempts: attempts + 1,
      })
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [state, refreshBalance])

  if (state.kind === 'idle') return null

  const open =
    state.kind === 'processing' ||
    state.kind === 'success' ||
    state.kind === 'timeout' ||
    state.kind === 'cancelled'

  function close() {
    setState({ kind: 'idle' })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/30',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-card p-5 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          {state.kind === 'processing' && (
            <ProcessingView attempt={state.attempts + 1} max={POLL_MAX_ATTEMPTS} />
          )}
          {state.kind === 'success' && (
            <SuccessView
              deltaCents={state.deltaCents}
              balanceCents={paid.account?.balance_cents ?? null}
              onClose={close}
            />
          )}
          {state.kind === 'timeout' && <TimeoutView onClose={close} />}
          {state.kind === 'cancelled' && <CancelledView onClose={close} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ProcessingView({ attempt, max }: { attempt: number; max: number }) {
  return (
    <>
      <Dialog.Title className="font-serif text-lg font-semibold">
        Processing top-up…
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted-foreground">
        Stripe charged your card. Waiting for the webhook to credit your
        balance — usually a few seconds.
      </Dialog.Description>
      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.min(100, (attempt / max) * 100)}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Check {attempt} of {max}
        </p>
      </div>
    </>
  )
}

function SuccessView({
  deltaCents,
  balanceCents,
  onClose,
}: {
  deltaCents: number
  balanceCents: number | null
  onClose: () => void
}) {
  return (
    <>
      <Dialog.Title className="font-serif text-lg font-semibold">
        Topped up.
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted-foreground">
        Your balance was credited.
      </Dialog.Description>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Added
        </dt>
        <dd className="font-mono font-medium text-foreground">
          +{fmtCents(deltaCents)}
        </dd>
        {balanceCents != null && (
          <>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              New balance
            </dt>
            <dd className="font-mono font-medium text-foreground">
              {fmtCents(balanceCents)}
            </dd>
          </>
        )}
      </dl>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={onClose}>
          Continue
        </Button>
      </div>
    </>
  )
}

function TimeoutView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Dialog.Title className="font-serif text-lg font-semibold">
        Still processing
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted-foreground">
        Stripe confirmed the charge, but the credit hasn&apos;t landed yet —
        the webhook may be delayed. Reload in a minute or two; if it still
        hasn&apos;t cleared, check your Stripe receipt and contact support.
      </Dialog.Description>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={onClose}>
          Dismiss
        </Button>
      </div>
    </>
  )
}

function CancelledView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Dialog.Title className="font-serif text-lg font-semibold">
        Checkout cancelled
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted-foreground">
        No charge was made. You can try again from the AI access panel.
      </Dialog.Description>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={onClose}>
          Dismiss
        </Button>
      </div>
    </>
  )
}

function fmtCents(c: number): string {
  if (!Number.isFinite(c)) return '—'
  if (c < 100 && c > -100) return `${c.toFixed(0)}¢`
  return `$${(c / 100).toFixed(2)}`
}
