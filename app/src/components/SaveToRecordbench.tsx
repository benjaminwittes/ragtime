import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'

import { openSave, saveMessage, type SaveItem, type SaveOutcome } from '@/lib/recordbench-save'
import { cn } from '@/lib/utils'

/**
 * "Save to Recordbench" on one document or on a list (`lib/recordbench-save.ts`).
 *
 * Opens Recordbench's save page in a new window and hands it the documents' addresses.
 * Nothing is written from here; the person saves on the bench, under their own sign-in.
 * Renders nothing when there is nothing to hand over.
 *
 * Three looks, because a list of results repeats it. `button` is the bordered
 * control, for a surface with one save (a report, a corpus's list). `link` is
 * quiet text beside "Open workspace →" on a section header. `icon` is the
 * per-row bookmark: it shows when the row is hovered or holds focus, and on a
 * touch screen, which has no hover, it stays visible but faint. A row that
 * uses it carries the `group` class.
 */
export function SaveToRecordbench({
  outcome,
  items,
  name,
  report,
  label,
  className,
  variant = 'button',
}: {
  outcome: SaveOutcome
  items: readonly SaveItem[]
  /** What the person searched for. It names the folder a list is saved into. */
  name?: string | null
  /** A research librarian report's words, for a `report`. */
  report?: string | null
  label?: string
  className?: string
  variant?: 'button' | 'link' | 'icon'
}) {
  const [blocked, setBlocked] = useState(false)
  const message = saveMessage(outcome, items, name, report)
  if (!message) return null
  const count = message.refs.length
  const title =
    outcome === 'document'
      ? 'Open Recordbench to save this document into an investigation'
      : outcome === 'report'
        ? `Open Recordbench to save this report and the ${count} documents it cites into an investigation`
        : `Open Recordbench to save these ${count} documents into an investigation, as one folder`
  const text = label ?? 'Save to Recordbench'

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <button
        type="button"
        onClick={() => setBlocked(!openSave(message))}
        title={title}
        aria-label={variant === 'icon' ? text : undefined}
        data-variant={variant}
        className={cn(
          variant === 'button' &&
            'inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10',
          variant === 'link' && 'text-xs text-primary hover:underline',
          variant === 'icon' &&
            'inline-flex items-center rounded p-0.5 text-muted-foreground transition-opacity hover:text-primary focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:none)]:opacity-60',
        )}
      >
        {variant === 'icon' ? <BookmarkPlus aria-hidden className="size-3.5" /> : text}
      </button>
      {blocked && (
        <span className="text-[11px] text-destructive" role="status">
          The browser blocked the new window. Allow pop-ups for this site and try again.
        </span>
      )}
    </span>
  )
}
