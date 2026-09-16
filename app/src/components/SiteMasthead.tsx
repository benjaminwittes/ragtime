import type { MouseEvent, ReactNode } from 'react'
import { toHref, toLogical } from '@/lib/routing'

/**
 * Slim site masthead shown atop every spoke page and the Explorer (injected
 * once at the App level — see activeSpokeShell and ExplorerRoute). Carries the
 * RAGtime brand onto them so the app reads as one branded surface; the
 * wordmark doubles as a "home" affordance back to the hub.
 *
 * Brand plus one link, by design: the per-page controls (Docs toggle, AI
 * access) live in each page's own header band just below, so this strip
 * carries no controls. The Explorer is a route beside the hub rather than a
 * spoke, so the way to it lives here — once, above every spoke — instead of in
 * eleven header bands.
 *
 * Navigation mirrors BackToHubLink: a plain href keeps cmd/ctrl-click and
 * right-click working; only unmodified left-clicks are intercepted for in-app
 * SPA routing (pushState + popstate, which App's router listens for).
 */
export function SiteMasthead() {
  const here = toLogical(window.location.pathname)
  return (
    <header className="border-b border-lawfare-line bg-lawfare-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <MastheadLink to="/" className="flex items-baseline gap-3" aria-label="RAGtime — back to hub">
          <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            RAGtime
          </span>
          <span className="hidden font-serif text-[14px] italic text-lawfare-text-secondary sm:inline">
            research across government
          </span>
        </MastheadLink>
        <div className="flex items-center gap-4">
          <nav aria-label="Site">
            <MastheadLink
              to="/explorer"
              className="text-sm font-medium text-primary hover:underline aria-[current=page]:underline"
              aria-current={here === '/explorer' ? 'page' : undefined}
            >
              Explorer
            </MastheadLink>
          </nav>
          <span className="hidden text-xs text-lawfare-muted sm:inline">
            a project of{' '}
            <span className="font-bold text-lawfare-text-secondary">Lawfare</span>
          </span>
        </div>
      </div>
    </header>
  )
}

/** An in-app link in the masthead: a real href, with plain left-clicks routed through the History API. */
function MastheadLink({
  to,
  className,
  children,
  ...aria
}: {
  to: string
  className?: string
  children: ReactNode
  'aria-label'?: string
  'aria-current'?: 'page'
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (toLogical(window.location.pathname) !== to) {
      window.history.pushState(null, '', toHref(to))
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }
  return (
    <a href={toHref(to)} onClick={onClick} className={className} {...aria}>
      {children}
    </a>
  )
}
