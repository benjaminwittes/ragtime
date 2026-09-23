import { AppLink } from '@/components/AppLink'
import { cn } from '@/lib/utils'

/**
 * "← All corpora" affordance for spoke headers — the way back to the hub.
 *
 * Self-contained navigation: the spoke shells aren't handed App's `navigate`, so this goes
 * through `AppLink`, which drives the History API and dispatches the `popstate` App's
 * router listens for — and keeps cmd/ctrl-click and right-click working, because the href
 * is real.
 */
export function BackToHubLink({ className }: { className?: string }) {
  return (
    <AppLink
      to="/"
      className={cn(
        'inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      <span aria-hidden>←</span> All corpora
    </AppLink>
  )
}
