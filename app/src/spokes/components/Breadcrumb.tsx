import { ChevronRightIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StackPage } from '../stack'

/**
 * Brief #6 §0 decision 1 — operation chain breadcrumb.
 *
 * Renders the stack as a navigable chain of operation labels. Clicking
 * any past page enters read-only "viewing past" mode. The tip is always
 * the active scope for new operations; if the user is viewing past, a
 * banner above invites them to return to the tip.
 *
 * Stack navigation controls (restored from the legacy single-file UI):
 *   - "Discard last layer" (onPopTip) — drop the tip and return to the
 *     previous scope. Shown only when on the tip (you discard what you're on).
 *   - "Reset session" (onReset) — discard the whole stack, back to All cases.
 *     Always available once a stack exists.
 *   - "Return to current" (onReturnToTip) — shown when viewing a past page.
 *
 * Per the brief, this component is hidden when the stack is empty — the
 * empty-state main panel is genuinely empty. We render nothing in that
 * case; SpokeShell decides whether to mount us.
 */
export function Breadcrumb({
  stack,
  viewingIdx,
  onViewPast,
  onReturnToTip,
  onPopTip,
  onReset,
}: {
  stack: readonly StackPage[]
  viewingIdx: number
  onViewPast: (idx: number) => void
  onReturnToTip: () => void
  onPopTip: () => void
  onReset: () => void
}) {
  if (stack.length === 0) return null

  const tipIdx = stack.length - 1
  const isViewingTip = viewingIdx === tipIdx

  return (
    <div className="border-b border-border bg-muted/30 px-6 py-2">
      <nav aria-label="Operations" className="flex items-center gap-1 text-xs">
        <RootCrumb />
        {stack.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground/60" />
            <Crumb
              label={p.operationLabel}
              count={p.count}
              active={i === viewingIdx}
              isTip={i === tipIdx}
              onClick={() => onViewPast(i)}
            />
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {isViewingTip ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onPopTip}
              title="Discard the last layer and return to the previous scope"
              className="h-6 gap-1 px-2 text-[11px]"
            >
              <Undo2Icon className="h-3 w-3" />
              Discard last layer
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReturnToTip}
              className="h-6 px-2 text-[11px]"
            >
              Return to current ↦
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            title="Discard all layers and start a fresh session"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon className="h-3 w-3" />
            Reset session
          </Button>
        </div>
      </nav>
    </div>
  )
}

/**
 * Static root anchor — semantically "you started here" but not a navigable
 * page (there's nothing to render at index -1). A label, not a button.
 */
function RootCrumb() {
  return (
    <span className="px-1.5 py-0.5 font-mono uppercase tracking-wide text-muted-foreground">
      All cases
    </span>
  )
}

function Crumb({
  label,
  count,
  active,
  isTip,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  isTip: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} · ${count.toLocaleString()} cases`}
      className={cn(
        'flex items-baseline gap-1.5 rounded px-1.5 py-0.5',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted hover:text-foreground',
        isTip && !active && 'font-medium',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <span className="truncate">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {count.toLocaleString()}
      </span>
    </button>
  )
}
