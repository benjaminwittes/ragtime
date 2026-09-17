import { useEffect, useState } from 'react'
import { CheckoutReturnGate } from '@/auth/CheckoutReturnGate'
import { SiteBar, SiteBarSlotProvider } from '@/components/SiteBar'
import { Hub } from '@/hub/Hub'
import { PrivacyPolicy } from '@/legal/PrivacyPolicy'
import { TermsOfService } from '@/legal/TermsOfService'
import { SpokeShell } from '@/spokes/SpokeShell'
import { CfrSpokeShell } from '@/spokes/cfr/CfrSpokeShell'
import { CommentarySpokeShell } from '@/spokes/commentary/CommentarySpokeShell'
import { CongressSpokeShell } from '@/spokes/congress/CongressSpokeShell'
import { FbiSpokeShell } from '@/spokes/fbi/FbiSpokeShell'
import { FrSpokeShell } from '@/spokes/fr/FrSpokeShell'
import { FrusSpokeShell } from '@/spokes/frus/FrusSpokeShell'
import { OlcSpokeShell } from '@/spokes/olc/OlcSpokeShell'
import { PresidentialSpokeShell } from '@/spokes/presidential/PresidentialSpokeShell'
import { SanctionsSpokeShell } from '@/spokes/sanctions/SanctionsSpokeShell'
import { UscSpokeShell } from '@/spokes/usc/UscSpokeShell'
import { getSpokeBySlug } from '@/spokes/registry'
import { ExplorerPage } from '@/explorer/ExplorerPage'
import { spokeSlugFor } from '@/lib/deep-link'
import { navigateTo, toHref, toLogical } from '@/lib/routing'
import { withViewTransition } from '@/lib/transition'
import { type CorpusSlug, type CorpusSpoke, links } from '@lawfare/ragtime-client'

/**
 * Top-level app shell + minimal pathname router.
 *
 * Routes:
 *   `/`                          → hub (multi-spoke landing per brief #1)
 *   `/explorer`                  → the Explorer: a conversation that orients,
 *                                  proposes a brief, researches, and hands off
 *                                  into the spokes (`src/explorer/`)
 *   `/corpus/<slug>`             → full `SpokeShell`
 *   `/corpus/<slug>/<id>`        → the same shell, which opens that
 *                                  document's detail sheet on mount (the
 *                                  Explorer's document handoff; see
 *                                  `readDeepLink` in lib/routing.ts)
 *   anything else                → "not found"
 *
 * The `/corpus/…` shapes are the deep-link grammar — `links` in the client
 * package (`packages/client`), the one writer and reader of those URLs; the
 * query string (`?q=`, facets, `ids=`, `mode=`) is read by the spoke, not
 * here — routing stays pathname-based.
 *
 * No router library yet — premature given the small route surface. The
 * History API is wired manually so in-app navigation doesn't full-reload:
 * `AppLink` intercepts plain left-clicks and hands them to `navigateTo`,
 * which pushes and then dispatches a `popstate` — the same event the
 * browser's own back/forward raises. So the listener below is not one of
 * several ways the route changes; it is the only one, which is what lets
 * the view transition be wrapped around it once (`lib/transition.ts`,
 * `transitions.css`).
 */

type Route =
  | { kind: 'hub' }
  | { kind: 'explorer' }
  | { kind: 'privacy' }
  | { kind: 'terms' }
  | { kind: 'spoke'; slug: CorpusSlug }
  | { kind: 'not-found'; pathname: string }

function parseRoute(pathname: string): Route {
  // Strip any query string / hash — routing is pathname-based; the `?q=`
  // carryover and the rest of the deep link are read separately by the
  // spoke (see readCarryoverQuery / readDeepLink).
  pathname = pathname.split('?')[0].split('#')[0]
  if (pathname === '/' || pathname === '') return { kind: 'hub' }
  if (pathname === '/privacy') return { kind: 'privacy' }
  if (pathname === '/terms') return { kind: 'terms' }
  if (pathname === '/explorer') return { kind: 'explorer' }
  const link = links.parse(pathname)
  if (link) {
    // `/corpus/<slug>` and `/corpus/<slug>/<id>` both mount the spoke; the
    // shell reads the id itself. A collection-qualified slug
    // (`congress:laws`) routes to its corpus, and a Worker corpus this app
    // hosts inside another spoke (`clemency`) routes to that spoke.
    const slug = spokeSlugFor(link.slug) as CorpusSlug
    if (getSpokeBySlug(slug)) return { kind: 'spoke', slug }
  }
  return { kind: 'not-found', pathname }
}

function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(toLogical(window.location.pathname)),
  )

  useEffect(() => {
    // The one place the route changes, and therefore the one place worth wrapping. Every
    // way into this app's surfaces ends in a `popstate`: `AppLink` and `navigateTo`
    // dispatch a synthetic one after `pushState`, and Back/Forward raise the real one.
    // So the whole site cross-fades, and the choreography in `transitions.css` runs,
    // from a single seam rather than from a wrapper at each call site — which is the
    // only reason it is affordable to have at all.
    function onPopState() {
      withViewTransition(() => {
        setRoute(parseRoute(toLogical(window.location.pathname)))
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // `onNavigate` below is `navigateTo` itself (lib/routing.ts), not a local wrapper
  // around it. App used to keep its own copy of the rule — pushState, then `setRoute`
  // directly — the same two lines with one difference nobody chose: it compared pathname
  // alone. That pushed a duplicate history entry whenever the target differed from the
  // current URL only by its query string, and refused to move at all when the target
  // differed only by *dropping* one (`/corpus/olc?q=habeas` → `/corpus/olc` left the
  // reader standing where they were, the query still in the address bar). `navigateTo`
  // compares pathname and search together, and it dispatches the `popstate` the listener
  // above already handles — so a hub card, the masthead, a citation inside an Explorer
  // answer and the browser's own Back button all arrive at the route change by the same
  // road, which is what makes that one listener worth wrapping.

  // The CheckoutReturnGate is rendered as a sibling next to every route so
  // it picks up `?checkout=success|cancel` on whichever surface the user
  // lands on after Stripe redirect (typically the hub at "/", but any
  // signed-in path is valid).
  const surface =
    route.kind === 'explorer'
      ? <ExplorerPage />
      : route.kind === 'spoke'
      ? (() => {
          const spoke = getSpokeBySlug(route.slug)
          if (!spoke) return <NotFound pathname={`/corpus/${route.slug}`} onNavigate={navigateTo} />
          return spokeShell(spoke)
        })()
      : route.kind === 'privacy'
        ? <PrivacyPolicy onNavigate={navigateTo} />
        : route.kind === 'terms'
          ? <TermsOfService onNavigate={navigateTo} />
          : route.kind === 'not-found'
            ? <NotFound pathname={route.pathname} onNavigate={navigateTo} />
            : <Hub onNavigate={navigateTo} />

  // One bar, mounted here rather than inside the routes, so it survives navigation
  // instead of unmounting and remounting under the reader. Everything route-specific
  // in it arrives through `SiteBarActions` — the provider has to wrap both ends.
  const onExplorer = route.kind === 'explorer'
  return (
    <SiteBarSlotProvider>
      {/* The Explorer is the one route that is a fixed-height column rather than a
          page that scrolls: the bar, then the conversation taking what is left, so
          `.scroll` scrolls inside itself and the composer stays put (explorer.css,
          "Under the masthead"). Every other surface is ordinary flow under the bar. */}
      <div className={onExplorer ? 'flex h-dvh flex-col' : undefined}>
        <SiteBar onExplorer={onExplorer} />
        {surface}
      </div>
      <CheckoutReturnGate />
    </SiteBarSlotProvider>
  )
}

/**
 * Pick the right shell for a spoke. The litigation spoke uses the full
 * stack-runtime `SpokeShell`; USC v1 alpha uses a slimmer
 * manual-filter-only shell while AI modes + stack runtime catch up.
 * Other spokes add their own branches here.
 */
function spokeShell(spoke: CorpusSpoke) {
  const shell =
    spoke.slug === 'usc' ? (
      <UscSpokeShell spoke={spoke} />
    ) : spoke.slug === 'cfr' ? (
      <CfrSpokeShell spoke={spoke} />
    ) : spoke.slug === 'olc' ? (
      <OlcSpokeShell spoke={spoke} />
    ) : spoke.slug === 'frus' ? (
      <FrusSpokeShell spoke={spoke} />
    ) : spoke.slug === 'commentary' ? (
      <CommentarySpokeShell spoke={spoke} />
    ) : spoke.slug === 'presidential' ? (
      <PresidentialSpokeShell spoke={spoke} />
    ) : spoke.slug === 'fr' ? (
      <FrSpokeShell spoke={spoke} />
    ) : spoke.slug === 'congress' ? (
      <CongressSpokeShell spoke={spoke} />
    ) : spoke.slug === 'fbi' ? (
      <FbiSpokeShell spoke={spoke} />
    ) : spoke.slug === 'sanctions' ? (
      <SanctionsSpokeShell spoke={spoke} />
    ) : (
      <SpokeShell spoke={spoke} />
    )
  // The brand, the docs and AI access all come from the one bar in `App` now; a
  // spoke puts its own identity up there through `SiteBarActions` and keeps only
  // its disclosure and holdings in the page.
  return shell
}

function NotFound({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate: (path: string) => void
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-serif text-3xl font-bold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No surface matches <code className="font-mono">{pathname}</code>.
        </p>
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
              onNavigate('/')
            }
          }}
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          ← Back to hub
        </a>
      </div>
    </main>
  )
}

export default App
