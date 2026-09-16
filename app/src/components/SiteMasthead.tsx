import { AppLink } from '@/components/AppLink'
import { toLogical } from '@/lib/routing'

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
 * Navigation is `AppLink`, the app's one in-app link: a plain href that keeps
 * cmd/ctrl-click and right-click working, with only unmodified left-clicks
 * routed through the History API.
 */
export function SiteMasthead() {
  const here = toLogical(window.location.pathname)
  return (
    <header className="border-b border-lawfare-line bg-lawfare-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <AppLink to="/" className="flex items-baseline gap-3" aria-label="RAGtime — back to hub">
          <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            RAGtime
          </span>
          <span className="hidden font-serif text-[14px] italic text-lawfare-text-secondary sm:inline">
            research across government
          </span>
        </AppLink>
        <div className="flex items-center gap-4">
          <nav aria-label="Site">
            <AppLink
              to="/explorer"
              className="text-sm font-medium text-primary hover:underline aria-[current=page]:underline"
              aria-current={here === '/explorer' ? 'page' : undefined}
            >
              Explorer
            </AppLink>
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
