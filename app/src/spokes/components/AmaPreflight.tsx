import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AmaPlan } from '@/lib/worker-client'

/**
 * Pre-flight modal shown between AMA planning and execution when the
 * estimated cost exceeds AMA_CONFIRM_THRESHOLD_CENTS. Surfaces the agent's
 * plan and asks for confirmation before the synthesis step is charged.
 *
 * Brief #6 §0 decision 3 + legacy index.html v9.0.0: the modal exists to
 * give the user a chance to refine the question rather than absorb a large
 * spend by reflex.
 *
 * Paid-tier UI (balance, per-query cap warning) is gated behind `mode`; for
 * PR 4g it's always BYOK. The paid-tier sign-in PR will populate the missing
 * fields without changing the API.
 */
export function AmaPreflight({
  plan,
  open,
  onProceed,
  onCancel,
}: {
  plan: AmaPlan | null
  open: boolean
  onProceed: () => void
  onCancel: () => void
}) {
  if (!plan) return null

  const modeLabel =
    plan.output_mode === 'list'
      ? 'List (narrows the field)'
      : plan.output_mode === 'narrative'
        ? 'Narrative answer'
        : 'Hybrid (narrative + list)'

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
          </dl>

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

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onProceed}>
              Proceed
            </Button>
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
