import { useState } from 'react'

import { openSave, saveMessage, type SaveItem, type SaveOutcome } from '@/lib/recordbench-save'
import { cn } from '@/lib/utils'

/**
 * "Save to Recordbench" on one document or on a list (`lib/recordbench-save.ts`).
 *
 * Opens Recordbench's save page in a new window and hands it the documents' addresses.
 * Nothing is written from here; the person saves on the bench, under their own sign-in.
 * Renders nothing when there is nothing to hand over.
 */
export function SaveToRecordbench({
  outcome,
  items,
  name,
  report,
  label,
  className,
}: {
  outcome: SaveOutcome
  items: readonly SaveItem[]
  /** What the person searched for. It names the folder a list is saved into. */
  name?: string | null
  /** A research librarian report's words, for a `report`. */
  report?: string | null
  label?: string
  className?: string
}) {
  const [blocked, setBlocked] = useState(false)
  const message = saveMessage(outcome, items, name, report)
  if (!message) return null
  const count = message.refs.length

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <button
        type="button"
        onClick={() => setBlocked(!openSave(message))}
        title={
          outcome === 'document'
            ? 'Open Recordbench to save this document into an investigation'
            : outcome === 'report'
              ? `Open Recordbench to save this report and the ${count} documents it cites into an investigation`
              : `Open Recordbench to save these ${count} documents into an investigation, as one folder`
        }
        className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
      >
        {label ?? 'Save to Recordbench'}
      </button>
      {blocked && (
        <span className="text-[11px] text-destructive" role="status">
          The browser blocked the new window. Allow pop-ups for this site and try again.
        </span>
      )}
    </span>
  )
}
