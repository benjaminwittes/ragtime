import { cn } from '@/lib/utils'
import { toHref, toLogical } from '@/lib/routing'

/**
 * "← All corpora" affordance for spoke headers — the way back to the hub.
 *
 * Self-contained navigation: the spoke shells aren't handed App's `navigate`,
 * so this drives the History API directly and dispatches a `popstate` event,
 * which App's router already listens for. A plain `href` keeps cmd/ctrl-click
 * (open-in-new-tab) and right-click working; only unmodified left-clicks are
 * intercepted for in-app SPA navigation.
 */
export function BackToHubLink({ className }: { className?: string }) {
  return (
    <a
      href={toHref('/')}
      onClick={(e) => {
        if (
          e.button === 0 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault()
          if (toLogical(window.location.pathname) !== '/') {
            window.history.pushState(null, '', toHref('/'))
            window.dispatchEvent(new PopStateEvent('popstate'))
          }
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      <span aria-hidden>←</span> All corpora
    </a>
  )
}
