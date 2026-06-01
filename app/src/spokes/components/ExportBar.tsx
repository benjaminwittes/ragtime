import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Dataset-export affordance shown on result pages. Restores the legacy
 * "Download CSV ↓" / analysis-PDF affordances dropped in the React rebuild.
 *
 * Presentational: the caller binds `onCsv` / `onPdf` to corpus-specific
 * builders. A button renders only when its callback is provided — CSV for any
 * tabular result, PDF for narrative (analysis / AMA) output.
 */
export function ExportBar({
  onCsv,
  onPdf,
  className,
}: {
  onCsv?: () => void
  onPdf?: () => void
  className?: string
}) {
  if (!onCsv && !onPdf) return null
  return (
    <div className={cn('flex items-center gap-2 px-6 pt-2', className)}>
      {onCsv && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCsv}
          title="Download these results as CSV (operation metadata embedded as # comment lines)"
        >
          Download CSV ↓
        </Button>
      )}
      {onPdf && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPdf}
          title="Download the narrative as a formatted PDF (via your browser's print dialog)"
        >
          Download PDF ↓
        </Button>
      )}
    </div>
  )
}
