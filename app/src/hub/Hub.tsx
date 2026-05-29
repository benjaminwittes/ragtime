import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import { spokes } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@/spokes/types'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * Hub landing surface — brief #1 (general AMA hub).
 *
 * The hub is the user's entry point to RAGtime. It surfaces the loaded
 * corpora as cards with their holdings (counts + coverage + last-updated),
 * each active card linking into its spoke and each coming-soon card
 * showing the holdings disclosure but no link.
 *
 * The cross-corpus keyword search (brief #1 §3 free tier) sits above the
 * spoke grid: a single plain-language input fires parallel FTS queries
 * across all 5 corpora and surfaces grouped-by-corpus results inline.
 * The paid AI synthesis layer (brief #1 Phase 2) lands later — needs
 * pgvector to provide a single comparable relevance score across tables.
 */
export function Hub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <HubHeader />
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <HubHero />
        <HubKeywordSearch onNavigate={onNavigate} />
        <SpokeGrid onNavigate={onNavigate} />
        <AboutPanel />
      </div>
    </main>
  )
}

function HubHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
            RAGtime
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            a Lawfare research surface
          </span>
        </div>
        <div className="flex items-center gap-4">
          <DocsTrigger />
          <AccessSettings />
        </div>
      </div>
    </header>
  )
}

function HubHero() {
  return (
    <section className="border-b border-border py-10">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground">
        Research across federal-government records.
      </h1>
      <p className="mt-3 max-w-3xl text-base text-muted-foreground">
        RAGtime is a queryable, AI-augmented research surface across federal
        litigation, executive opinions, statutes, regulations, and diplomatic
        history. Free keyword filtering on every corpus; bring-your-own-key
        for AI features; paid prepaid blocks for Lawfare-billed access to
        Anthropic models.
      </p>
    </section>
  )
}

/**
 * Cross-corpus keyword AMA placeholder.
 *
 * Brief #1's flagship feature — free keyword AMA that spans all loaded
 * corpora. v1 ships disabled because (a) cross-corpus query routing on the
 * Worker hasn't been designed yet and (b) only one spoke is implemented,
 * so cross-corpus has nothing to cross to. The UI affordance is here so
 * the user understands what's coming.
 */
function SpokeGrid({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="space-y-3 py-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl font-semibold">Corpora</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {spokes.length} loaded
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {spokes.map((s) => (
          <SpokeCard key={s.slug} spoke={s} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  )
}

function SpokeCard({
  spoke,
  onNavigate,
}: {
  spoke: CorpusSpoke
  onNavigate: (path: string) => void
}) {
  const active = spoke.status === 'active'
  const href = `/corpus/${spoke.slug}`

  return (
    <Card
      className={
        active ? 'transition hover:border-primary/60 hover:shadow-sm' : ''
      }
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold">{spoke.title}</h3>
          <StatusBadge status={spoke.status} />
        </div>
        <p className="text-sm text-muted-foreground">{spoke.description}</p>
        <HoldingsSummary spoke={spoke} />
        {active ? (
          <a
            href={href}
            onClick={(e) => {
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
            className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open <span aria-hidden>→</span>
          </a>
        ) : (
          <a
            href={href}
            onClick={(e) => {
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
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/70"
          >
            Preview details →
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: CorpusSpoke['status'] }) {
  if (status === 'active') {
    return (
      <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        Live
      </span>
    )
  }
  if (status === 'coming-soon') {
    return (
      <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Coming soon
      </span>
    )
  }
  return (
    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      Archived
    </span>
  )
}

/**
 * Holdings disclosure rendered inside each card. Counts come from the
 * spoke's `getHoldings()` — for litigation, that's a live Worker call;
 * for the coming-soon stubs, hardcoded values from the corpus ingest
 * reports.
 *
 * Failures render as a quiet "—" rather than blocking the card. The hub is
 * a navigation surface; a stale or unreachable count shouldn't keep the
 * user from getting into the spoke.
 */
function HoldingsSummary({ spoke }: { spoke: CorpusSpoke }) {
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
      <p className="font-mono text-xs text-muted-foreground">
        (holdings unavailable)
      </p>
    )
  }
  if (!holdings) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        Loading holdings…
      </p>
    )
  }

  // Render the counts inline (e.g. "1,099,912 cases · 6,749,136 entries").
  const countEntries = Object.entries(holdings.counts)
  const countLine = countEntries
    .map(([k, v]) => `${v.toLocaleString()} ${k}`)
    .join(' · ')

  return (
    <dl className="space-y-1 font-mono text-xs text-muted-foreground">
      <div>{countLine}</div>
      <div>{holdings.coverage}</div>
    </dl>
  )
}

function AboutPanel() {
  return (
    <section className="mt-12 border-t border-border pt-6">
      <h2 className="font-serif text-base font-semibold">About RAGtime</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        A Lawfare Institute research surface. Free tier covers structured
        filtering and free keyword search; AI features (analysis, narrative
        synthesis, agentic ask) require either your own provider API key
        (bring-your-own-key) or a paid prepaid balance billed by Lawfare.
        The corpora here are democracy-adjacent public information held in
        a queryable form; corpus loaders are reproducible and open-source.
      </p>
    </section>
  )
}
