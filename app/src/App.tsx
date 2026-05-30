import { useEffect, useState } from 'react'
import { CheckoutReturnGate } from '@/auth/CheckoutReturnGate'
import { ComingSoonSpoke } from '@/hub/ComingSoonSpoke'
import { Hub } from '@/hub/Hub'
import { SpokeShell } from '@/spokes/SpokeShell'
import { CfrSpokeShell } from '@/spokes/cfr/CfrSpokeShell'
import { FrusSpokeShell } from '@/spokes/frus/FrusSpokeShell'
import { OlcSpokeShell } from '@/spokes/olc/OlcSpokeShell'
import { UscSpokeShell } from '@/spokes/usc/UscSpokeShell'
import { getSpokeBySlug } from '@/spokes/registry'
import { toHref, toLogical } from '@/lib/routing'
import type { CorpusSlug, CorpusSpoke } from '@/spokes/types'

/**
 * Top-level app shell + minimal pathname router.
 *
 * Routes:
 *   `/`                          → hub (multi-spoke landing per brief #1)
 *   `/corpus/<slug>` (active)    → full `SpokeShell`
 *   `/corpus/<slug>` (coming-    → `ComingSoonSpoke` landing page
 *                     soon)
 *   anything else                → "not found"
 *
 * No router library yet — premature given the small route surface. The
 * History API is wired manually so in-app navigation doesn't full-reload;
 * `Link` intercepts plain left-clicks and calls `pushState`, and a
 * `popstate` listener keeps state in sync with back/forward.
 */

type Route =
  | { kind: 'hub' }
  | { kind: 'spoke'; slug: CorpusSlug }
  | { kind: 'not-found'; pathname: string }

function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { kind: 'hub' }
  const m = pathname.match(/^\/corpus\/([^/]+)\/?$/)
  if (m) {
    const slug = m[1] as CorpusSlug
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
    route.kind === 'spoke'
      ? (() => {
          const spoke = getSpokeBySlug(route.slug)
          if (!spoke) return <NotFound pathname={`/corpus/${route.slug}`} onNavigate={navigate} />
          if (spoke.status === 'active') return activeSpokeShell(spoke)
          return <ComingSoonSpoke spoke={spoke} onNavigate={navigate} />
        })()
      : route.kind === 'not-found'
        ? <NotFound pathname={route.pathname} onNavigate={navigate} />
        : <Hub onNavigate={navigate} />

  return (
    <>
      {surface}
      <CheckoutReturnGate />
    </>
  )
}

/**
 * Pick the right shell for an active spoke. The litigation spoke uses the
 * full stack-runtime `SpokeShell`; USC v1 alpha uses a slimmer
 * manual-filter-only shell while AI modes + stack runtime catch up.
 * Other spokes will add their own branches as they come online.
 */
function activeSpokeShell(spoke: CorpusSpoke) {
  if (spoke.slug === 'usc') return <UscSpokeShell spoke={spoke} />
  if (spoke.slug === 'cfr') return <CfrSpokeShell spoke={spoke} />
  if (spoke.slug === 'olc') return <OlcSpokeShell spoke={spoke} />
  if (spoke.slug === 'frus') return <FrusSpokeShell spoke={spoke} />
  return <SpokeShell spoke={spoke} />
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
