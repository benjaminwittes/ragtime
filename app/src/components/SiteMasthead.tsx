import { toHref, toLogical } from '@/lib/routing'

/**
 * Slim site masthead shown atop every spoke page (injected once at the App
 * level — see activeSpokeShell). Carries the RAGtime brand onto the spokes so
 * the app reads as one branded surface; the wordmark doubles as a "home"
 * affordance back to the hub.
 *
 * Brand-only by design: the per-page controls (Docs toggle, AI access) live in
 * each spoke's own header band just below, so this strip deliberately carries
 * no controls — keeping it a clean masthead and avoiding any duplication.
 *
 * Navigation mirrors BackToHubLink: a plain href keeps cmd/ctrl-click and
 * right-click working; only unmodified left-clicks are intercepted for in-app
 * SPA routing (pushState + popstate, which App's router listens for).
 */
export function SiteMasthead() {
  return (
    <header className="border-b border-lawfare-line bg-lawfare-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
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
          className="flex items-baseline gap-3"
          aria-label="RAGtime — back to hub"
        >
          <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            RAGtime
          </span>
          <span className="hidden font-serif text-[14px] italic text-lawfare-text-secondary sm:inline">
            research across government
          </span>
        </a>
        <span className="hidden text-xs text-lawfare-muted sm:inline">
          a project of{' '}
          <span className="font-bold text-lawfare-text-secondary">Lawfare</span>
        </span>
      </div>
    </header>
  )
}
