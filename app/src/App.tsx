import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { spokes } from '@/spokes/registry'

function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <h1 className="font-serif text-5xl font-bold tracking-tight text-foreground">
            RAGtime
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            React rebuild — capability descriptor (PR 3 of foundation work)
          </p>
        </header>

        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">
                What this PR adds
              </CardTitle>
              <CardDescription>
                The TypeScript contract every corpus spoke implements
                (<code className="font-mono text-sm">CorpusSpoke</code>), the
                stack-of-operations + pivot types
                (<code className="font-mono text-sm">Page</code>,{' '}
                <code className="font-mono text-sm">Stack</code>,{' '}
                <code className="font-mono text-sm">StackHistory</code> — with
                stash-and-pivot semantics built in per the 2026-05-27 "more
                like this" hook decision), and a stub registry. No UI is
                rendered from the descriptors yet; the renderer ships with
                the litigation spoke port in PR 5.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Design rationale and field-by-field mapping to brief decisions
                live at{' '}
                <code className="font-mono text-sm">src/spokes/SPEC.md</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">
                Registered spokes (live read from the registry)
              </CardTitle>
              <CardDescription>
                The list below is loaded from{' '}
                <code className="font-mono text-sm">@/spokes/registry</code>,
                which type-checks against{' '}
                <code className="font-mono text-sm">CorpusSpoke</code>. Adding
                a spoke is one import + array entry.
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
                    <dt className="text-muted-foreground">Flagships</dt>
                    <dd className="font-mono">
                      {spoke.flagships.present.join(' / ')}
                      {spoke.flagships.paradigmatic &&
                        ` (★ ${spoke.flagships.paradigmatic})`}
                    </dd>
                    <dt className="text-muted-foreground">Default depth</dt>
                    <dd className="font-mono">{spoke.defaultSearchDepth}</dd>
                    <dt className="text-muted-foreground">More like this</dt>
                    <dd className="font-mono">
                      {spoke.moreLikeThis
                        ? `${spoke.moreLikeThis.documentUnit.label} · ${spoke.moreLikeThis.similarityHints.length} hints`
                        : '—'}
                    </dd>
                  </dl>
                  <p className="mt-3 text-xs italic text-muted-foreground">
                    {spoke.plainEnglishDisclosure}
                  </p>
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
                  <strong className="text-foreground">PR 4</strong> — Docs
                  registry (floating documentation infrastructure per brief #6
                  decision 9b)
                </li>
                <li>
                  <strong className="text-foreground">PR 5</strong> — Litigation
                  spoke port: real implementation of the five modes from{' '}
                  <code className="font-mono text-xs">index.html</code> against
                  the descriptor + design system. The generic spoke renderer
                  lands here too.
                </li>
                <li>
                  <strong className="text-foreground">PR 6+</strong> — OLC, USC,
                  CFR, FRUS spokes (each is mostly descriptor + corpus-specific
                  query module); collections architecture per brief #7;
                  "more like this" implementation post-beta.
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
