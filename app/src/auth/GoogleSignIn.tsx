import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The parts of signing in with Google that every sign-in form shares: the button, the
 * divider that says an email form follows, and the mark. The AI access sheet and the
 * connector's consent page both use them, so the two read the same.
 *
 * Whether to show the button at all is the caller's question (`useGoogleOffered`): the
 * auth project says whether Google is on, and a button that cannot sign anyone in is
 * worse than none.
 */

/**
 * "Continue with Google". `pointedAt` draws a ring round it, for when the form has just
 * told someone that their address signs in with Google and this is the button it means.
 */
export function GoogleButton({
  onClick,
  leaving,
  disabled,
  pointedAt = false,
}: {
  onClick: () => void
  /** The browser is on its way to Google; the button says so and stays put. */
  leaving: boolean
  disabled?: boolean
  pointedAt?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={leaving || disabled}
      className={cn(
        'flex w-full items-center justify-center gap-2',
        pointedAt && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
      data-sign-in="google"
      data-pointed-at={pointedAt ? '' : undefined}
    >
      <GoogleMark />
      {leaving ? 'Opening Google…' : 'Continue with Google'}
    </Button>
  )
}

/**
 * The divider between the Google button and the email form. A paragraph and not a
 * separator: a separator's words are not read out, and these are the ones that say a
 * second way in follows.
 */
export function OrByEmail() {
  return (
    <p className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      or by email
    </p>
  )
}

/** Google's "G", in its own four colours, as its sign-in branding asks. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
