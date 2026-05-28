import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '@/spokes/types'

/**
 * Landing page shown when the user navigates directly to a coming-soon
 * spoke (e.g., `/corpus/cfr` before the CFR Worker endpoints exist).
 *
 * Shows the corpus's declared holdings + plain-English disclosure so the
 * page is informative rather than just a "404 / placeholder" treatment.
 * Surface area = the descriptor metadata that's already authoritative.
 *
 * Header mirrors the hub for visual continuity (same brand bar + DocsTrigger
 * + AccessSettings).
 */
export function ComingSoonSpoke({
  spoke,
  onNavigate,
}: {
  spoke: CorpusSpoke
  onNavigate: (path: string) => void
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <a
            href="/"
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
            className="font-serif text-2xl font-bold tracking-tight text-foreground hover:opacity-80"
          >
            RAGtime
          </a>
          <div className="flex items-center gap-4">
            <DocsTrigger />
            <AccessSettings />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="font-serif text-2xl font-semibold">
                {spoke.title}
              </h1>
              <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Coming soon
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{spoke.description}</p>
            <Holdings spoke={spoke} />
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Plain-English disclosure
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {spoke.plainEnglishDisclosure}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This corpus is loaded and indexed but isn&apos;t yet surfaced
              to users. The Worker endpoints that drive the spoke land in
              their own PR.
            </p>
            <a
              href="/"
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
              className="inline-block text-sm text-primary hover:underline"
            >
              ← Back to hub
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function Holdings({ spoke }: { spoke: CorpusSpoke }) {
  const [holdings, setHoldings] = useState<CorpusHoldings | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const h = await spoke.getHoldings()
        if (!cancelled) setHoldings(h)
      } catch {
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [spoke])

  if (errored) {
    return (
      <p className="text-xs text-muted-foreground">(holdings unavailable)</p>
    )
  }
  if (!holdings) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        Loading holdings…
      </p>
    )
  }

  const countEntries = Object.entries(holdings.counts)
  return (
    <div className="space-y-1">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Holdings
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs text-foreground/90">
        {countEntries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v.toLocaleString()}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">coverage</dt>
        <dd>{holdings.coverage}</dd>
        <dt className="text-muted-foreground">updated</dt>
        <dd>{String(holdings.lastUpdated)}</dd>
        {holdings.provenance && (
          <>
            <dt className="text-muted-foreground">provenance</dt>
            <dd>
              {Object.entries(holdings.provenance)
                .map(([k, v]) => `${v.toLocaleString()} ${k}`)
                .join(' · ')}
            </dd>
          </>
        )}
      </dl>
      {holdings.knownGaps && holdings.knownGaps.length > 0 && (
        <div className="pt-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Known gaps
          </h3>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {holdings.knownGaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
