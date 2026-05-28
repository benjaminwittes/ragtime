import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { SpokeShell } from '@/spokes/SpokeShell'
import { spokes, getSpokeBySlug } from '@/spokes/registry'
import type { CorpusSlug } from '@/spokes/types'

/**
 * Top-level app shell + minimal pathname router.
 *
 * Routes (v1):
 *   `/`                          → hub stub (placeholder until hub brief #1
 *                                  implementation lands)
 *   `/corpus/<slug>`             → spoke renderer for that corpus
 *   anything else                → "not found" stub
 *
 * No router library yet — premature given (a) only two real routes exist
 * and (b) the hub-and-spoke architecture is still being designed at the
 * strategic-brief level. Real router lands when the hub gets implemented.
 *
 * The History API is wired manually so in-app navigation doesn't full-
 * reload; <Link> intercepts clicks and calls `pushState`, and a `popstate`
 * listener keeps state in sync with back/forward.
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
    parseRoute(window.location.pathname),
  )

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(pathname: string) {
    if (pathname === window.location.pathname) return
    window.history.pushState(null, '', pathname)
    setRoute(parseRoute(pathname))
  }

  if (route.kind === 'spoke') {
    const spoke = getSpokeBySlug(route.slug)
    if (spoke) return <SpokeShell spoke={spoke} />
  }
  if (route.kind === 'not-found') {
    return <NotFound pathname={route.pathname} onNavigate={navigate} />
  }
  return <HubStub onNavigate={navigate} />
}

function HubStub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-5xl font-bold tracking-tight text-foreground">
              RAGtime
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Research surfaces across federal litigation, executive opinions,
              statutes, regulations, and diplomatic history.
            </p>
          </div>
          <DocsTrigger />
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              Hub coming soon
            </CardTitle>
            <CardDescription>
              The cross-corpus AMA hub (per query-design brief #1) is the
              eventual landing surface. While it's being designed, jump
              straight into a corpus spoke.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {spokes.map((s) => (
              <div
                key={s.slug}
                className="flex items-baseline justify-between gap-4 rounded-md border border-border p-4"
              >
                <div>
                  <h3 className="font-serif text-lg font-semibold">
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {s.description}
                  </p>
                </div>
                {s.status === 'active' ? (
                  <Link
                    href={`/corpus/${s.slug}`}
                    onNavigate={onNavigate}
                    className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Open →
                  </Link>
                ) : (
                  <span className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                    {s.status === 'coming-soon' ? 'Coming soon' : 'Archived'}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
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
          No surface matches{' '}
          <code className="font-mono">{pathname}</code>.
        </p>
        <Link
          href="/"
          onNavigate={onNavigate}
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          ← Back to hub
        </Link>
      </div>
    </main>
  )
}

function Link({
  href,
  onNavigate,
  className,
  children,
}: {
  href: string
  onNavigate: (path: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Only intercept plain left-clicks without modifier keys; let
        // ctrl-/cmd-click open in new tab as expected.
        if (
          e.button === 0 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault()
          onNavigate(href)
        }
      }}
    >
      {children}
    </a>
  )
}

export default App
