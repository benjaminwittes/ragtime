import { ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MoreLikeThisController } from './useMoreLikeThis'

/**
 * The active "More like this" pivot stack, rendered in place of the spoke's
 * own panes while a pivot is in progress (the spoke view is stashed — see
 * useMoreLikeThis). Shows:
 *   - a breadcrumb back to the stashed spoke view and across the pivot chain,
 *   - the tip's lens + route + any honesty caveat (brief §5),
 *   - ranked result cards — each opens in the spoke's detail sheet and can be
 *     pivoted on again (push a new page onto this stack),
 *   - a "widen" affordance when more results are available.
 */
export function MoreLikeThisView({
  controller,
  documentUnitLabel,
  onOpenResult,
  openingId,
}: {
  controller: MoreLikeThisController
  documentUnitLabel: string
  /** Open a result in the spoke's detail sheet (resolve id → full row). */
  onOpenResult: (id: string) => void
  /** Id currently being resolved for the detail sheet (shows a spinner). */
  openingId?: string | null
}) {
  const { pages, stashedLabel, loading, error, back, goToPage, widen, reset, requestPivot } =
    controller
  const tip = pages[pages.length - 1]

  return (
    <div className="border-b border-border">
      {/* Breadcrumb: stashed spoke view › pivot chain. */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-6 py-2 text-xs">
        <button
          type="button"
          onClick={reset}
          className="font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {stashedLabel}
        </button>
        {pages.map((p, i) => {
          const isTip = i === pages.length - 1
          const label = pivotCrumbLabel(p.prompt, p.result.route)
          return (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRightIcon className="h-3 w-3 text-muted-foreground/50" />
              {isTip ? (
                <span className="font-medium text-foreground">{label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => goToPage(i)}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {label}
                </button>
              )}
            </span>
          )
        })}
        <button
          type="button"
          onClick={back}
          className="ml-auto rounded-md border border-border px-2 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ← Back
        </button>
      </nav>

      {/* Tip header: what these results are matched on. */}
      {tip && (
        <div className="border-b border-border bg-background px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <RouteBadge route={tip.result.route} />
            <span className="text-sm text-foreground/90">{tip.result.lens}</span>
          </div>
          {tip.result.note && (
            <aside
              className={cn(
                'mt-2 rounded-md border px-3 py-2 text-xs',
                'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
              )}
            >
              {tip.result.note}
            </aside>
          )}
        </div>
      )}

      {/* Body. */}
      <div className="px-6 py-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            Finding similar {documentUnitLabel}s…
          </p>
        )}
        {error && !loading && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && tip && tip.result.results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No similar {documentUnitLabel}s found for this lens. Try a broader
            description, or “overall similarity”.
          </p>
        )}
        {!loading && tip && tip.result.results.length > 0 && (
          <>
            <ul className="space-y-2">
              {tip.result.results.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenResult(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-serif text-sm font-semibold leading-snug text-foreground">
                        {item.title}
                        {openingId === item.id && (
                          <span className="ml-2 inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground align-middle" />
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[item.context, item.date].filter(Boolean).join(' · ')}
                        {item.similarity != null && (
                          <span className="ml-2 font-mono text-muted-foreground/70">
                            {(item.similarity * 100).toFixed(0)}% match
                          </span>
                        )}
                      </p>
                      {item.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/70">
                          {item.snippet}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        requestPivot({ id: Number(item.id), title: item.title })
                      }
                      disabled={loading}
                      title={`More like this ${documentUnitLabel}`}
                      className={cn(
                        'shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground',
                        'hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      More like this
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {tip.result.widen_available && (
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={widen}
                  disabled={loading}
                >
                  Widen — show more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Short breadcrumb label for a pivot page. */
function pivotCrumbLabel(prompt: string, route: string): string {
  const p = prompt.trim()
  if (!p) return route === 'compound' ? 'similar' : 'overall similarity'
  return p.length > 32 ? p.slice(0, 31) + '…' : p
}

function RouteBadge({ route }: { route: 'meaning' | 'compound' }) {
  const isCompound = route === 'compound'
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider',
        isCompound
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground',
      )}
      title={
        isCompound
          ? 'Matched on the specific aspect you described (semantic feature search)'
          : 'Matched on overall similarity (semantic nearest-neighbor)'
      }
    >
      {isCompound ? 'aspect' : 'overall'}
    </span>
  )
}
