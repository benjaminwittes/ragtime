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
import { toHref, toLogical } from '@/lib/routing'
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
 * History API is wired manually so in-app navigation doesn't full-reload;
 * `Link` intercepts plain left-clicks and calls `pushState`, and a
 * `popstate` listener keeps state in sync with back/forward.
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
    function onPopState() {
      setRoute(parseRoute(toLogical(window.location.pathname)))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // `logicalPath` is base-relative (`/`, `/corpus/<slug>`); `toHref` adds the
  // deploy mount prefix before it touches the History API / the address bar.
  function navigate(logicalPath: string) {
    if (toLogical(window.location.pathname) === logicalPath) return
    window.history.pushState(null, '', toHref(logicalPath))
    setRoute(parseRoute(logicalPath))
  }

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
          if (!spoke) return <NotFound pathname={`/corpus/${route.slug}`} onNavigate={navigate} />
          return spokeShell(spoke)
        })()
      : route.kind === 'privacy'
        ? <PrivacyPolicy onNavigate={navigate} />
        : route.kind === 'terms'
          ? <TermsOfService onNavigate={navigate} />
          : route.kind === 'not-found'
            ? <NotFound pathname={route.pathname} onNavigate={navigate} />
            : <Hub onNavigate={navigate} />

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
