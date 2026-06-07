import { useDocs } from './DocsContext'
import { cn } from '@/lib/utils'

/**
 * Inline "?" marker that deep-links into the docs overlay for a specific
 * topic. The contextual counterpart to the header DocsTrigger: placed next
 * to an operational control (the mode row, a Summarize button, etc.) so a
 * user confused by *that* element can pull up the topic that describes it
 * without hunting through the full topic list.
 *
 * Promised by the `using-documentation` entry ("the small ? markers next to
 * specific controls open straight to the topic for that element").
 *
 * Stops click propagation so it never triggers an enclosing row/card click
 * handler (e.g. a result card that opens a detail sheet).
 */
export function DocsHint({
  slug,
  label,
  className,
}: {
  /** Docs entry slug to open. */
  slug: string
  /** Short description of what the linked topic covers, for the accessible
   *  label / tooltip (e.g. "how these modes differ"). */
  label?: string
  className?: string
}) {
  const { open } = useDocs()
  const aria = label ? `Open documentation: ${label}` : 'Open documentation'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        open(slug)
      }}
      aria-label={aria}
      title={aria}
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-border bg-muted font-mono text-[11px] leading-none text-muted-foreground transition-colors hover:bg-foreground hover:text-background',
        className,
      )}
    >
      ?
    </button>
  )
}
