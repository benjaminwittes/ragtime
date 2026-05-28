import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { spokes } from '@/spokes/registry'
import { DocsTrigger } from '@/docs/DocsTrigger'

function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-5xl font-bold tracking-tight text-foreground">
              RAGtime
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              React rebuild — docs registry infrastructure (PR 4a of foundation work)
            </p>
          </div>
          <DocsTrigger />
        </header>

        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">
                What this PR adds
              </CardTitle>
              <CardDescription>
                The floating-documentation infrastructure that replaces the
                welcome card's "How to use" content and the mode-button
                tooltips (per brief #6 §6). Press{' '}
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">?</kbd>{' '}
                anywhere to open it, or click the "? Docs" button in the
                header. Suppressed inside text inputs so it doesn't fight
                with normal typing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The registry (<code className="font-mono text-sm">src/docs/registry.ts</code>)
                is empty at v1 — the overlay shows an empty-state message.
                Editorial content is a later editorial pass (PR 4b), likely
                staged with each spoke's implementation so per-spoke docs are
                written against the real surface rather than a stub.
              </p>
              <p>
                Entries are scoped <code className="font-mono text-sm">global</code>{' '}
                (always visible) or to a specific corpus spoke (visible only
                when that spoke is the active context). The spoke renderer
                (lands PR 5) will call{' '}
                <code className="font-mono text-sm">setActiveSpokeSlug()</code>{' '}
                when the user enters / leaves a spoke; the overlay filters
                accordingly.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">
                Registered spokes (carried from PR 3)
              </CardTitle>
              <CardDescription>
                Live read from{' '}
                <code className="font-mono text-sm">@/spokes/registry</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {spokes.map((spoke) => (
                <div
                  key={spoke.slug}
                  className="rounded-md border border-border p-4"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-serif text-lg font-semibold">
                      {spoke.title}
                    </h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {spoke.slug} · {spoke.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {spoke.description}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Query modes</dt>
                    <dd className="font-mono">{spoke.queryModes.length}</dd>
                    <dt className="text-muted-foreground">Facets</dt>
                    <dd className="font-mono">{spoke.facets.length}</dd>
                    <dt className="text-muted-foreground">Scopes</dt>
                    <dd className="font-mono">{spoke.scopes?.length ?? 0}</dd>
                    <dt className="text-muted-foreground">More like this</dt>
                    <dd className="font-mono">
                      {spoke.moreLikeThis
                        ? `${spoke.moreLikeThis.documentUnit.label} · ${spoke.moreLikeThis.similarityHints.length} hints`
                        : '—'}
                    </dd>
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">What's next</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                <li>
                  <strong className="text-foreground">PR 4b</strong> —
                  Editorial content (the actual "How to use" + cross-cutting
                  principles entries; conversation with Ben on what goes in)
                </li>
                <li>
                  <strong className="text-foreground">PR 5</strong> —
                  Litigation spoke port: real implementation of the five
                  modes from <code className="font-mono text-xs">index.html</code>;
                  generic spoke renderer lands here; calls{' '}
                  <code className="font-mono text-xs">setActiveSpokeSlug('litigation')</code>{' '}
                  to set docs context
                </li>
                <li>
                  <strong className="text-foreground">PR 6+</strong> — Other
                  spokes (OLC, USC, CFR, FRUS), collections architecture per
                  brief #7, "more like this" implementation post-beta
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

export default App
