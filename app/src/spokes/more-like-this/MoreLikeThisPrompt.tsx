import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MltSeed } from './useMoreLikeThis'

/**
 * The "in what way?" ask-UI (briefs, locked 2026-06-11: ALWAYS ask — we never
 * assume the axis). Click "More like this" on a document → this modal asks the
 * user to name the thread of similarity in free-form NL, with corpus-shaped
 * chips as starting points and an explicit "overall similarity" escape hatch
 * that takes the zero-cost meaning route.
 *
 * Two ways out:
 *   - "Overall similarity" → submit({ prompt: '', route: 'meaning' }) — pure
 *     seed-centroid kNN, no model call.
 *   - free text (typed or chip-seeded) → submit({ prompt, route: 'auto' }) —
 *     the Worker's axis-aware router classifies + extrapolates.
 */
export function MoreLikeThisPrompt({
  seed,
  documentUnitLabel,
  similarityHints,
  loading,
  onSubmit,
  onCancel,
}: {
  seed: MltSeed | null
  documentUnitLabel: string
  similarityHints: string[]
  loading: boolean
  onSubmit: (opts: { prompt: string; route: 'auto' | 'meaning' }) => void
  onCancel: () => void
}) {
  const [prompt, setPrompt] = useState('')
  // Reset the field whenever a new seed opens the dialog — the
  // store-previous-value-and-reset-during-render pattern (React's
  // recommended alternative to a setState-in-effect).
  const [lastSeedId, setLastSeedId] = useState<number | null>(null)
  if (seed && seed.id !== lastSeedId) {
    setLastSeedId(seed.id)
    setPrompt('')
  }

  if (!seed) return null

  const trimmed = prompt.trim()

  function submitAxis() {
    if (!trimmed || loading) return
    onSubmit({ prompt: trimmed, route: 'auto' })
  }

  function submitOverall() {
    if (loading) return
    onSubmit({ prompt: '', route: 'meaning' })
  }

  return (
    <Dialog.Root
      open={!!seed}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/30',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2',
            'flex max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold">
                More like this {documentUnitLabel}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                {seed.title ?? `#${seed.id}`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cancel"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <p className="mt-3 text-sm text-foreground/90">
              Similar <strong>in what way?</strong> Describe the thread that
              matters — a theory, a holding, a topic, an event. Or just ask for
              the overall most-similar {documentUnitLabel}s.
            </p>

            {similarityHints.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {similarityHints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    disabled={loading}
                    onClick={() => setPrompt(hint)}
                    className={cn(
                      'rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/80',
                      'hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  submitAxis()
                }
              }}
              rows={3}
              autoFocus
              placeholder="e.g. opinions reaching the opposite conclusion on the same question"
              disabled={loading}
              className={cn(
                'mt-3 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Uses your configured AI access to read the seed through your
              chosen lens. Cost shows in your balance after. ⌘/Ctrl+Enter to run.
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={submitOverall}
              disabled={loading}
              className={cn(
                'text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
              title="Most-similar overall — pure semantic nearest-neighbor, no model call"
            >
              Overall similarity instead
            </button>
            <Button type="button" onClick={submitAxis} disabled={!trimmed || loading}>
              {loading ? 'Finding…' : 'Find similar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
