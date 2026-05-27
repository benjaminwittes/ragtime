import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <h1 className="font-serif text-5xl font-bold tracking-tight text-foreground">
            RAGtime
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            React rebuild — design system (PR 2 of foundation work)
          </p>
        </header>

        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">What this PR adds</CardTitle>
              <CardDescription>
                Tailwind 4 + shadcn/ui (Nova preset, Radix primitives) + Lawfare
                brand tokens (teal accent palette, EB Garamond serif headings,
                Lato body text — all matching the legacy{' '}
                <code className="font-mono text-sm">index.html</code>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                The teal on the buttons below and on the input's focus ring is{' '}
                <code className="font-mono text-sm">#006A72</code> — Lawfare's
                brand color, applied via shadcn's{' '}
                <code className="font-mono text-sm">--primary</code> /{' '}
                <code className="font-mono text-sm">--ring</code> CSS variables.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button>Primary action</Button>
                <Button variant="outline">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="mt-6">
                <label className="block text-sm font-medium mb-2" htmlFor="demo-input">
                  Click into this input to see the Lawfare-teal focus ring
                </label>
                <Input
                  id="demo-input"
                  placeholder="e.g. preliminary injunction, TRO…"
                  className="max-w-md"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">What's next</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                <li>
                  <strong className="text-foreground">PR 3</strong> — Per-corpus
                  capability descriptor (TypeScript types every spoke implements)
                </li>
                <li>
                  <strong className="text-foreground">PR 4</strong> — Docs
                  registry (floating documentation infrastructure per brief #6
                  decision 9b)
                </li>
                <li>
                  <strong className="text-foreground">PR 5</strong> — Litigation
                  spoke port: the first real corpus surface, with the five modes
                  from <code className="font-mono text-xs">index.html</code>{' '}
                  ported per brief #6
                </li>
                <li>
                  <strong className="text-foreground">PR 6+</strong> — OLC, USC,
                  CFR, FRUS spokes; collections architecture per brief #7;
                  "more like this" hooks per the 2026-05-27 decision
                </li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                Production site still serves from the legacy{' '}
                <code className="font-mono text-sm">index.html</code> at the
                repo root via GH Pages. Cutover happens at the end of the
                foundation work, not now.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

export default App
