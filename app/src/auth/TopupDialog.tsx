import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { startCheckout, type TopupBlock } from '@/lib/worker-client'
import { usePaid } from './use-paid'

/**
 * Top-up modal — pick a prepaid block size, redirect to Stripe Checkout.
 *
 * Three blocks ($5 / $20 / $50) per the Worker's Stripe price config.
 * On Buy: POST /api/checkout with the chosen block + the current window
 * origin (the Worker validates the origin against an allowlist before
 * using it in the post-checkout redirect — so dev tests on localhost
 * land back on localhost, production tests on the GH Pages URL).
 *
 * The actual top-up is confirmed asynchronously by the Stripe webhook,
 * not by the redirect — see `CheckoutReturnGate` for the post-return
 * balance-poll UX.
 */
export function TopupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const paid = usePaid()
  const [block, setBlock] = useState<TopupBlock>('20')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBuy() {
    if (!paid.session?.access_token) {
      setError('Sign-in expired. Sign in again.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await startCheckout({
        block,
        sessionToken: paid.session.access_token,
        returnOrigin: window.location.origin,
      })
      if (!res.checkout_url) {
        throw new Error('No checkout URL returned by the server.')
      }
      // Hand off to Stripe. The user will return via the success/cancel
      // URL; `CheckoutReturnGate` picks up the result on app reload.
      window.location.href = res.checkout_url
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold">
                Top up your balance
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Buy a prepaid block. You&apos;ll be redirected to Stripe to
                pay; balance is credited automatically after checkout.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <BlockOption
              value="5"
              label="$5"
              selected={block === '5'}
              onSelect={setBlock}
              disabled={submitting}
            />
            <BlockOption
              value="20"
              label="$20"
              selected={block === '20'}
              onSelect={setBlock}
              disabled={submitting}
              recommended
            />
            <BlockOption
              value="50"
              label="$50"
              selected={block === '50'}
              onSelect={setBlock}
              disabled={submitting}
            />
          </div>

          {paid.account && (
            <p className="mt-3 text-xs text-muted-foreground">
              Current balance:{' '}
              <span className="font-mono">
                {fmtCents(paid.account.balance_cents)}
              </span>{' '}
              · post-top-up:{' '}
              <span className="font-mono font-medium text-foreground">
                {fmtCents(paid.account.balance_cents + blockCents(block))}
              </span>
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <p className="mt-4 text-[11px] text-muted-foreground">
            Stripe handles payment off-platform. You&apos;ll be redirected
            back here once checkout completes; the balance update may take a
            few seconds while the Stripe webhook posts to the Worker.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleBuy} disabled={submitting}>
              {submitting ? 'Redirecting…' : `Buy $${block} block`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BlockOption({
  value,
  label,
  selected,
  onSelect,
  disabled,
  recommended,
}: {
  value: TopupBlock
  label: string
  selected: boolean
  onSelect: (v: TopupBlock) => void
  disabled: boolean
  recommended?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'relative rounded-md border px-3 py-4 text-center transition',
        selected
          ? 'border-primary bg-primary/5 text-foreground'
          : 'border-border bg-card text-foreground/80 hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="block font-serif text-xl font-semibold">{label}</span>
      <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {value === '5' ? 'sip' : value === '20' ? 'block' : 'pack'}
      </span>
      {recommended && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary-foreground">
          rec
        </span>
      )}
    </button>
  )
}

function blockCents(b: TopupBlock): number {
  if (b === '5') return 500
  if (b === '20') return 2000
  return 5000
}

function fmtCents(c: number): string {
  if (!Number.isFinite(c)) return '—'
  if (c < 100 && c > -100) return `${c.toFixed(0)}¢`
  return `$${(c / 100).toFixed(2)}`
}
