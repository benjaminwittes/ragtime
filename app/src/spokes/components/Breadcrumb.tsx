import { ChevronRightIcon } from 'lucide-react'
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
 * Per the brief, this component is hidden when the stack is empty — the
 * empty-state main panel is genuinely empty. We render nothing in that
 * case; SpokeShell decides whether to mount us.
 */
export function Breadcrumb({
  stack,
  viewingIdx,
  onViewPast,
  onReturnToTip,
}: {
  stack: readonly StackPage[]
  viewingIdx: number
  onViewPast: (idx: number) => void
  onReturnToTip: () => void
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
        {!isViewingTip && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReturnToTip}
            className="ml-auto h-6 px-2 text-[11px]"
          >
            Return to current ↦
          </Button>
        )}
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
