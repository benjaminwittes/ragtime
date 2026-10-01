import { useEffect, useState } from 'react'

import { formatCount } from '@/lib/format-count'
import { getHoldingsCached, readHoldingsSnapshot } from '@/lib/holdings-cache'
import { toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'
import { spokeGroups } from '@/spokes/registry'
import type { CorpusHoldings, CorpusSpoke } from '@lawfare/ragtime-client'

function useHoldings(spoke: CorpusSpoke): CorpusHoldings | null {
  const [holdings, setHoldings] = useState<CorpusHoldings | null>(() => readHoldingsSnapshot(spoke))
  useEffect(() => {
    let cancelled = false
    getHoldingsCached(spoke).then(
      (fetched) => {
        if (!cancelled) setHoldings(fetched)
      },
      () => {
        /* the snapshot, or nothing, stands */
      },
    )
    return () => {
      cancelled = true
    }
  }, [spoke])
  return holdings
}

function Headline({ spoke }: { spoke: CorpusSpoke }) {
  const holdings = useHoldings(spoke)
  const first = holdings ? Object.entries(holdings.counts)[0] : undefined
  return (
    <span className="font-mono text-[1.1cqw] text-lawfare-text-warm">
      {first ? `${formatCount(first[1])} ${first[0]}` : '…'}
    </span>
  )
}

function Detail({ spoke }: { spoke: CorpusSpoke }) {
  const holdings = useHoldings(spoke)
  return (
    <div className="flex h-full flex-col gap-[1cqw]" data-figure-detail={spoke.slug}>
      <h3 className="font-serif text-[2.6cqw] font-medium leading-tight">{spoke.title}</h3>
      <p className="text-[1.5cqw] leading-snug text-lawfare-text-secondary">{spoke.description}</p>
      {holdings && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-[1.2cqw] gap-y-[0.3cqw] font-mono text-[1.3cqw]">
            {Object.entries(holdings.counts).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-right tabular-nums text-foreground">{value.toLocaleString('en-US')}</dt>
                <dd className="text-lawfare-text-secondary">{label}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[1.3cqw] text-lawfare-text-secondary">{holdings.coverage}</p>
          {holdings.knownGaps && holdings.knownGaps.length > 0 && (
            <p className="text-[1.2cqw] leading-snug text-lawfare-muted">Not here: {holdings.knownGaps[0]}</p>
          )}
        </>
      )}
      <p className="mt-auto text-[1.4cqw]">
        <a
          href={toHref(spoke.route ?? `/corpus/${spoke.slug}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          Open this collection
        </a>
      </p>
    </div>
  )
}

/**
 * What RAGtime holds: every collection, in the hub's own groups, with its live count.
 * Pointing at one — or tabbing to it, or tapping it — says what it is, how far it reaches
 * and what it does not have. The groups and the words are the hub's (`spokes/registry`),
 * so this cannot say something the hub does not.
 */
export function HoldingsFigure() {
  const [active, setActive] = useState<CorpusSpoke>(() => spokeGroups[0].spokes[0])
  return (
    <div className="grid h-full grid-cols-[3fr_2fr] gap-[2.5cqw]" data-figure="holdings">
      <div className="flex min-h-0 flex-col justify-center gap-[1.1cqw]">
        {spokeGroups.map((group) => (
          <section key={group.heading}>
            <h3 className="mb-[0.4cqw] font-sans text-[1.1cqw] font-semibold uppercase tracking-[0.14em] text-primary">
              {group.heading}
            </h3>
            <div className="flex flex-wrap gap-[0.6cqw]">
              {group.spokes.map((spoke) => (
                <button
                  key={spoke.slug}
                  type="button"
                  data-figure-node={spoke.slug}
                  aria-pressed={active.slug === spoke.slug}
                  onPointerEnter={() => setActive(spoke)}
                  onFocus={() => setActive(spoke)}
                  onClick={() => setActive(spoke)}
                  className={cn(
                    // One line each: twelve tiles in five groups have to fit a slide.
                    'flex items-baseline gap-[0.9cqw] rounded-[0.6cqw] border bg-card px-[1cqw] py-[0.5cqw] text-left transition-colors',
                    active.slug === spoke.slug
                      ? 'border-primary bg-lawfare-teal-bg'
                      : 'border-lawfare-line-strong hover:border-primary',
                  )}
                >
                  <span className="font-serif text-[1.5cqw] leading-tight">{spoke.title}</span>
                  <Headline spoke={spoke} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="min-h-0 border-l border-lawfare-line pl-[2.5cqw]">
        <Detail key={active.slug} spoke={active} />
      </div>
    </div>
  )
}
