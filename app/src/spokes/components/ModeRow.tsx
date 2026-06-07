import type { QueryMode } from '../types'
import { cn } from '@/lib/utils'
import { DocsHint } from '@/docs/DocsHint'

/**
 * The five query modes ported wholesale from index.html (brief #6 decision 3).
 * Always visible (per brief #6 §6 modifications: "Mode row stays visible at
 * empty state — the only signal of what the surface is *for*; needs to be
 * discoverable from the first moment").
 *
 * v1 (this PR): only manual_filter is active. The other four modes are
 * shown but disabled with a "coming next" hint so users see the surface's
 * eventual scope. Each lands in its own subsequent PR.
 */
const MODE_LABELS: Record<QueryMode, string> = {
  manual_filter: 'Filter manually',
  claude_sql: 'AI writes SQL',
  claude_read: 'AI reads each case',
  claude_analysis: 'AI analyzes',
  claude_ama: 'AMA',
  advisory_retrieval: 'Test a fact pattern',
}

/** Brief mechanic description per mode (shown as title attribute / hover tip).
 *  These survive until the docs-registry editorial pass lands per-mode
 *  entries (brief #6 §6 deferred). */
const MODE_TIPS: Record<QueryMode, string> = {
  manual_filter:
    'Set filter criteria and apply them to produce a narrowed page.',
  claude_sql: 'Describe a filter in natural language; AI writes SQL.',
  claude_read: 'AI reads each case and keeps/drops per criterion.',
  claude_analysis:
    'AI analyzes the full case list and produces narrative + annotations.',
  claude_ama:
    'Ask anything about the current result set. AI plans, runs queries, and answers.',
  advisory_retrieval:
    'Bring a fact pattern; the system returns the theories from the corpus that match.',
}

export function ModeRow({
  modes,
  activeMode,
  enabledModes,
  onSelect,
  docSlug,
}: {
  /** All modes the descriptor declares for this spoke. */
  modes: readonly QueryMode[]
  activeMode: QueryMode
  /** Subset of `modes` that are currently functional. Disabled modes render
   *  but don't accept clicks. */
  enabledModes: readonly QueryMode[]
  onSelect: (mode: QueryMode) => void
  /** Docs entry describing what these modes are and how they differ. When
   *  set, an inline "?" marker at the end of the row deep-links to it —
   *  the contextual help affordance for the AI-function buttons. */
  docSlug?: string
}) {
  const enabled = new Set(enabledModes)
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-6 py-3">
      <div
        role="tablist"
        aria-label="Query modes"
        className="flex flex-1 flex-wrap gap-2"
      >
        {modes.map((m) => {
        const isEnabled = enabled.has(m)
        const isActive = m === activeMode
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={!isEnabled}
            title={isEnabled ? MODE_TIPS[m] : MODE_TIPS[m] + ' (coming next)'}
            disabled={!isEnabled}
            onClick={() => isEnabled && onSelect(m)}
            className={cn(
              'rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'bg-background text-foreground hover:bg-muted',
              !isEnabled && 'cursor-not-allowed opacity-40 hover:bg-background',
            )}
          >
            {MODE_LABELS[m]}
            {!isEnabled && (
              <span className="ml-1.5 text-xs opacity-70">soon</span>
            )}
          </button>
        )
      })}
      </div>
      {docSlug && (
        <DocsHint slug={docSlug} label="how these modes differ" />
      )}
    </div>
  )
}
