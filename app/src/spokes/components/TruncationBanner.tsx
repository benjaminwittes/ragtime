import { cn } from '@/lib/utils'
import { isTruncationCandor } from './truncation-marker'

/**
 * PR 4w. When the Worker's synthesis parser engaged its salvage path
 * (the model's output truncated mid-JSON before the closing brace),
 * one candor note carries the marker text that starts with "Synthesis
 * output was truncated mid-generation". This component detects that and
 * renders a prominent warning banner so the user knows the answer below
 * is partial — not just another candor caveat.
 *
 * Callers should also strip the marker from the regular candor-notes
 * block via `filterTruncationMarker` (in `./truncation-marker`) so the
 * same text doesn't show up twice.
 */
export function TruncationBanner({
  notes,
}: {
  notes: readonly string[]
}) {
  const truncationNote = notes.find(isTruncationCandor)
  if (!truncationNote) return null
  return (
    <aside
      role="alert"
      className={cn(
        'mb-3 rounded-md border px-3 py-2 text-xs',
        'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider">
        Partial answer — output was truncated
      </h3>
      <p className="mt-1 leading-relaxed">{truncationNote}</p>
      <p className="mt-1 leading-relaxed text-[10px] opacity-80">
        Re-run the question, or narrow it (smaller date range, single
        agency, single administration) to bring the synthesis output
        under the token cap.
      </p>
    </aside>
  )
}
