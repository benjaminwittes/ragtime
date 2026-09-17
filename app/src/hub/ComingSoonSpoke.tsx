import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { toHref } from '@/lib/routing'
import { SpokeIdentity } from '@/spokes/components/SpokeIdentity'
import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'

/**
 * Landing page shown when the user navigates directly to a coming-soon
 * spoke (e.g., `/corpus/cfr` before the CFR Worker endpoints exist).
 *
 * Shows the corpus's declared holdings + plain-English disclosure so the
 * page is informative rather than just a "404 / placeholder" treatment.
 * Surface area = the descriptor metadata that's already authoritative.
 *
 * It used to draw its own brand bar with the docs and AI-access buttons in it,
 * mirroring the hub. The site has one bar now, mounted above every route, so
 * this page draws none: the corpus's name goes up to that bar through
 * {@link SpokeIdentity}, the same way an active spoke's does, and what is left
 * here is the card.
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
      <SpokeIdentity spoke={spoke} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardContent className="space-y-5 p-6">
            {/* The corpus is named in the bar above, once, like every other
                `/corpus/<slug>` route. What the card has to add is that it is
                not open yet. */}
            <span className="inline-block rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Coming soon
            </span>
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
