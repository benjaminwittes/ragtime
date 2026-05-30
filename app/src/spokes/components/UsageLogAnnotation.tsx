import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AuthArg } from '@/lib/auth-arg'
import {
  type UsageLogRecord,
  postUsageLog,
  useUsageLogEnabled,
} from '@/lib/usage-log'

/**
 * Inline usage-log annotation bar (feature: ragtime-usage-log-feedback).
 *
 * Renders below an AMA answer when the private logging toggle is on. Two jobs:
 *  1. Auto-log the interaction (the full machine trace) once it lands — no
 *     rating needed, so every logged session is captured.
 *  2. Let the logger attach a star rating + free-text assessment, which
 *     merge-upserts onto the same row (keyed by interaction_id).
 *
 * Renders nothing when logging is off, so it's invisible to normal users.
 */
export function UsageLogAnnotation({
  record,
  auth,
}: {
  /** The assembled trace, minus rating/note (those come from this UI). */
  record: UsageLogRecord
  auth: AuthArg | null | undefined
}) {
  const enabled = useUsageLogEnabled()
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  // Track which interaction we've auto-logged so a re-render doesn't re-log,
  // and so a new result (new id) resets the form + re-logs.
  const loggedId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (loggedId.current === record.interaction_id) return
    loggedId.current = record.interaction_id
    // Reset the annotation form for the new interaction.
    setRating(null)
    setNote('')
    setSaveState('idle')
    // Fire-and-forget auto-log of the trace (no rating yet).
    void postUsageLog(record, auth)
    // We intentionally key only on interaction_id: `record` is rebuilt each
    // render but its trace is stable for a given interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, record.interaction_id])

  if (!enabled) return null

  async function handleSave() {
    setSaveState('saving')
    const ok = await postUsageLog(
      { ...record, rating: rating ?? null, note: note.trim() || null },
      auth,
    )
    setSaveState(ok ? 'saved' : 'error')
  }

  const canSave = rating != null || note.trim().length > 0

  return (
    <div className="mx-6 mb-6 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          📝 Your take
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          (logged for tuning — only you see this)
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => {
              setRating(n)
              setSaveState('idle')
            }}
            className={cn(
              'text-lg leading-none transition-colors',
              rating != null && n <= rating
                ? 'text-amber-500'
                : 'text-muted-foreground/30 hover:text-amber-400',
            )}
          >
            ★
          </button>
        ))}
        {rating != null && (
          <button
            type="button"
            onClick={() => {
              setRating(null)
              setSaveState('idle')
            }}
            className="ml-2 text-[10px] text-muted-foreground/60 hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          setSaveState('idle')
        }}
        rows={2}
        placeholder="What worked, what missed, anything off (e.g. 'nailed §1.3 but the Part 7 candor note is wrong')…"
        className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-xs shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!canSave || saveState === 'saving'}
          onClick={handleSave}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save note'}
        </Button>
        {saveState === 'saved' && (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
            Saved ✓
          </span>
        )}
        {saveState === 'error' && (
          <span className="text-[11px] text-destructive">
            Couldn't save (not logged) — check AI access.
          </span>
        )}
      </div>
    </div>
  )
}
