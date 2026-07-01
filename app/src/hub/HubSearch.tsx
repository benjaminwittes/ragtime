import { useState } from 'react'
import { cn } from '@/lib/utils'
import { HubAmaSearch } from './HubAmaSearch'
import { HubKeywordSearch } from './HubKeywordSearch'

/**
 * The hub's search surface. A segmented Ask / Search toggle over the two
 * cross-corpus modes:
 *   - Ask (default) — semantic: one unified cross-corpus ranking + an optional
 *     cited synthesis ({@link HubAmaSearch}). The "ask across everything" moment.
 *   - Search — keyword: grouped-by-corpus FTS ({@link HubKeywordSearch}), the
 *     original free demo surface, kept as the fast literal-match path.
 *
 * Semantic-first was the deliberate v1 call (once the unified embedding index
 * spanned the statutory + regulatory layers, a merged cross-corpus ranking
 * became honest); keyword is the secondary toggle.
 */
type HubSearchMode = 'ask' | 'search'

export function HubSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const [mode, setMode] = useState<HubSearchMode>('ask')

  return (
    <div>
      <div className="mx-auto flex max-w-2xl justify-center pt-6">
        <div
          role="tablist"
          aria-label="Search mode"
          className="inline-flex rounded-full border border-border bg-card p-0.5"
        >
          <ModeTab
            active={mode === 'ask'}
            onClick={() => setMode('ask')}
            label="Ask"
            hint="semantic"
          />
          <ModeTab
            active={mode === 'search'}
            onClick={() => setMode('search')}
            label="Search"
            hint="keyword"
          />
        </div>
      </div>

      {mode === 'ask' ? (
        <HubAmaSearch onNavigate={onNavigate} />
      ) : (
        <HubKeywordSearch onNavigate={onNavigate} />
      )}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-baseline gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'font-mono text-[9px] uppercase tracking-wider',
          active ? 'text-primary-foreground/70' : 'text-muted-foreground/70',
        )}
      >
        {hint}
      </span>
    </button>
  )
}
