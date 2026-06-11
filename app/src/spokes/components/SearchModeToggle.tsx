import { cn } from '@/lib/utils'
import { DocsHint } from '@/docs/DocsHint'

/**
 * Retrieval-mode toggle for embedded spokes (brief #9, locked 2026-06-11):
 * keyword / semantic / both, default BOTH — a user should never have to run
 * a search twice to get full results, so both is what you get without
 * touching anything and the single modes are escape hatches.
 *
 * Renders only on spokes whose descriptor sets `semanticSearch` (no
 * grayed-out tease elsewhere). NOT a query-architecture button (brief #7
 * decision 7 governs AI query shapes); this picks the retrieval mechanism
 * on plain search.
 */
export type SearchMode = 'keyword' | 'semantic' | 'both'

const MODE_LABELS: Record<SearchMode, string> = {
  both: 'Both',
  keyword: 'Keyword',
  semantic: 'Semantic',
}

const MODE_TIPS: Record<SearchMode, string> = {
  both: 'Run both searches and show the results side by side.',
  keyword: 'Match your exact words (full-text search).',
  semantic: 'Match your meaning, even when the words differ.',
}

const MODES: SearchMode[] = ['both', 'keyword', 'semantic']

export function SearchModeToggle({
  mode,
  onSelect,
  disabled,
}: {
  mode: SearchMode
  onSelect: (mode: SearchMode) => void
  /** Disables the control (e.g. while a search is in flight). */
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-6 pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Search by
      </span>
      <div
        role="radiogroup"
        aria-label="Retrieval mode"
        className="inline-flex overflow-hidden rounded-md border border-border"
      >
        {MODES.map((m) => {
          const isActive = m === mode
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={MODE_TIPS[m]}
              disabled={disabled}
              onClick={() => onSelect(m)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              {MODE_LABELS[m]}
            </button>
          )
        })}
      </div>
      <DocsHint
        slug="semantic-search"
        label="keyword vs. semantic search"
      />
    </div>
  )
}
