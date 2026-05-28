import { DocsTrigger } from '@/docs/DocsTrigger'
import { AccessSettings } from '@/llm/AccessSettings'
import type { CorpusHoldings, CorpusSpoke } from '../types'

/**
 * The spoke's top band: title + plain-English disclosure (brief #6 decision
 * 9b) + holdings counts (brief #6 decision 9a). Always visible, regardless
 * of stack state — these are corpus-level facts, not query-level state.
 *
 * Per brief #6 §6 modifications, the welcome card is gone; the disclosure
 * + holdings are the always-visible orientation at the top of the spoke.
 */
export function SpokeHeader({
  spoke,
  holdings,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  holdings: CorpusHoldings | undefined
  loading: boolean
  error: string | undefined
}) {
  // Render the plain-English disclosure. The descriptor's wording may contain
  // a `[last_synced_at]` template placeholder; substitute the actual date
  // from holdings.lastUpdated when available.
  const disclosure = renderDisclosure(spoke.plainEnglishDisclosure, holdings)

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            {spoke.title}
          </h1>
          <div className="flex items-center gap-2">
            <AccessSettings />
            <DocsTrigger />
            <p className="font-mono text-xs text-muted-foreground">
              {spoke.slug}
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{disclosure}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat
            label="Cases"
            value={formatStatValue(holdings?.counts.cases, loading, error)}
          />
          <Stat
            label="Docket entries"
            value={formatStatValue(
              holdings?.counts.docketEntries,
              loading,
              error,
            )}
          />
          <Stat
            label="Updated"
            value={formatDateValue(holdings?.lastUpdated, loading, error)}
          />
          <Stat label="Coverage" value={holdings?.coverage ? '—' : '—'} />
        </dl>

        {error && (
          <p className="mt-3 text-sm text-destructive">
            Couldn't load corpus holdings: {error}
          </p>
        )}
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-base text-foreground">{value}</dd>
    </div>
  )
}

function renderDisclosure(
  template: string,
  holdings: CorpusHoldings | undefined,
): string {
  if (!holdings) return template
  const date = formatDateValue(holdings.lastUpdated, false, undefined)
  return template.replace(/\[last_synced_at\]/g, date)
}

function formatStatValue(
  n: number | undefined,
  loading: boolean,
  error: string | undefined,
): string {
  if (error) return '—'
  if (loading || n === undefined) return '…'
  return n.toLocaleString()
}

function formatDateValue(
  d: Date | string | undefined,
  loading: boolean,
  error: string | undefined,
): string {
  if (error) return '—'
  if (loading || d === undefined) return '…'
  if (typeof d === 'string') return d
  if (d instanceof Date) {
    if (isNaN(d.getTime()) || d.getTime() === 0) return '—'
    return d.toISOString().slice(0, 10)
  }
  return '—'
}
