import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setAmaPreflightSkipped } from '@/lib/ama-preflight-skip'
import { cn } from '@/lib/utils'
import type { AmaPlan } from '@/lib/worker-client'

/**
 * Pre-flight modal shown between AMA planning and execution. PR 4w fires
 * the modal on EVERY query (the previous AMA_CONFIRM_THRESHOLD_CENTS=25¢
 * gate is gone — too easy to miss a sub-threshold spend by reflex).
 * Surfaces the agent's plan, estimated cost, balance/cap (paid mode), and
 * lets the user opt out of future modals via "Don't show this again".
 *
 * Brief #6 §0 decision 3 + Ben's testing pass: the modal makes cost
 * visible BEFORE spending. Auditability principle in miniature.
 *
 * Paid-mode extras (PR 4j): when `paidAccount` is non-null, the modal also
 * shows the user's current balance and per-query cap, and warns when the
 * estimate exceeds either. The Proceed button's copy adjusts to
 * "Proceed (override cap)" when the user is choosing to spend above their
 * own cap.
 *
 * Skip preference (PR 4w): the "Don't show this again" checkbox writes
 * to localStorage; the AccessSettings dropdown is the re-enable surface.
 */
export function AmaPreflight({
  plan,
  open,
  onProceed,
  onCancel,
  paidAccount,
}: {
  plan: AmaPlan | null
  open: boolean
  onProceed: () => void
  onCancel: () => void
  /** Paid-tier account snapshot. `null` in BYOK mode — balance/cap section
   *  is hidden in that case. */
  paidAccount: {
    balance_cents: number
    per_query_cap_cents: number
  } | null
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  function handleProceed() {
    if (dontShowAgain) setAmaPreflightSkipped(true)
    onProceed()
  }
  if (!plan) return null

  const modeLabel =
    plan.output_mode === 'list'
      ? 'List (narrows the field)'
      : plan.output_mode === 'narrative'
        ? 'Narrative answer'
        : 'Hybrid (narrative + list)'

  // Paid-mode budget signals.
  const exceedsCap = paidAccount
    ? plan.estimated_cost_cents > paidAccount.per_query_cap_cents
    : false
  const exceedsBalance = paidAccount
    ? plan.estimated_cost_cents > paidAccount.balance_cents
    : false
  const proceedLabel = exceedsCap ? 'Proceed (override cap)' : 'Proceed'

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
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
            'fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-card p-5 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold">
                Ask pre-flight
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Review the plan and estimated cost before running.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cancel"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated cost
            </dt>
            <dd className="font-mono">
              {fmtCents(plan.estimated_cost_cents)}
              <span className="ml-1 text-xs text-muted-foreground">
                (estimate)
              </span>
            </dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Output shape
            </dt>
            <dd>{modeLabel}</dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Queries
            </dt>
            <dd className="font-mono">
              {plan.queries.length.toLocaleString()}
            </dd>

            {paidAccount && (
              <>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Balance
                </dt>
                <dd className="font-mono">
                  {fmtCents(paidAccount.balance_cents)}
                </dd>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Per-query cap
                </dt>
                <dd className="font-mono">
                  {fmtCents(paidAccount.per_query_cap_cents)}
                </dd>
              </>
            )}
          </dl>

          {paidAccount && exceedsCap && (
            <p
              className={cn(
                'mt-3 rounded-md border border-amber-400/50 bg-amber-500/10',
                'px-3 py-2 text-xs text-amber-900 dark:text-amber-200',
              )}
            >
              Plan estimate ({fmtCents(plan.estimated_cost_cents)}) exceeds
              your per-query cap ({fmtCents(paidAccount.per_query_cap_cents)}).
              Refine the question to lower the estimate, or proceed once as
              an override.
            </p>
          )}
          {paidAccount && !exceedsCap && exceedsBalance && (
            <p
              className={cn(
                'mt-3 rounded-md border border-destructive/40',
                'bg-destructive/10 px-3 py-2 text-xs text-destructive',
              )}
            >
              Plan estimate exceeds your balance. The query may still
              complete cheaper than the high estimate, but if execution
              would push the balance below zero the Worker will stop it.
            </p>
          )}

          <section className="mt-4 space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plan
            </h4>
            <p className="text-sm leading-relaxed text-foreground/90">
              {plan.approach_summary || '(no plan summary)'}
            </p>
          </section>

          {plan.candor_notes.length > 0 && (
            <section className="mt-3 space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Candor notes
              </h4>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {plan.candor_notes.map((n, i) => (
                  <li key={i} className="leading-relaxed">
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-4 text-[11px] text-muted-foreground">
            Estimate is from the agent&apos;s planning step and may be off;
            you&apos;ll see the actual running cost in the session log as the
            query executes. Cancel and refine the question if you want to
            narrow scope.
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span>
                Don&apos;t show this again
                <span className="ml-1 text-muted-foreground/60">
                  (re-enable in AI access)
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={handleProceed}>
                {proceedLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function fmtCents(c: number): string {
  if (!Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(1)}¢`
  return `$${(c / 100).toFixed(2)}`
}
