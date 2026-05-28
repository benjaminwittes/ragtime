import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ANALYSIS_HARD_CAP } from '@/lib/worker-client'

/**
 * Brief #6 §0 decision 3 — `claude_analysis` mode ported wholesale.
 *
 * User supplies an analytical prompt; the Worker fetches the cases' docket
 * data, runs one LLM call, and returns a markdown narrative + optional
 * per-case annotations (rank / score / category / label). Cases are NOT
 * narrowed — the analysis is a layer above the existing result page.
 *
 * Server-side hard cap: ANALYSIS_HARD_CAP (2000 cases). Beyond that the
 * context doesn't fit; the user must narrow the field first. The cap is
 * surfaced as a disabled state with an explanation, not a silent failure.
 *
 * Placeholder is mechanic-flavored per brief #6 §7c (replacing the legacy
 * "rank by severity of non-compliance" framing that presupposed there's a
 * thing called non-compliance to rank).
 */
export function ClaudeAnalysisForm({
  loading,
  byokConfigured,
  scopeSize,
  onSubmit,
}: {
  loading: boolean
  byokConfigured: boolean
  scopeSize: number
  onSubmit: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState('')

  const scopeEmpty = scopeSize === 0
  const overCap = scopeSize > ANALYSIS_HARD_CAP
  const disabled = loading || !byokConfigured || scopeEmpty || overCap
  const canSubmit = !disabled && prompt.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(prompt.trim())
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 border-b border-border bg-card px-6 py-5"
    >
      {!byokConfigured && (
        <Banner kind="info">
          Configure an API key in <span className="font-medium">AI access</span>{' '}
          (header, top right) to use this mode.
        </Banner>
      )}
      {byokConfigured && scopeEmpty && (
        <Banner kind="info">
          Analyze operates on the current result page. Run a filter or AI
          writes SQL first to populate the field.
        </Banner>
      )}
      {byokConfigured && overCap && (
        <Banner kind="warn">
          Field is {scopeSize.toLocaleString()} cases — over the analysis cap
          of {ANALYSIS_HARD_CAP.toLocaleString()}. Narrow the field first
          (Filter manually, AI writes SQL, or AI reads each case).
        </Banner>
      )}

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Analytical prompt
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            Produces narrative + optional per-case annotations; field stays
            intact
          </span>
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="e.g. group cases by procedural posture; or: identify common factual patterns across these cases; or: rank by the procedural stage reached and label each"
          className={cn(
            'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {loading
            ? 'Analyzing…'
            : `Analyze ${scopeSize.toLocaleString()} case${scopeSize === 1 ? '' : 's'}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={loading || !prompt}
          onClick={() => setPrompt('')}
        >
          Clear
        </Button>
      </div>
    </form>
  )
}

function Banner({
  kind,
  children,
}: {
  kind: 'info' | 'warn'
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        kind === 'info' &&
          'border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200',
        kind === 'warn' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </div>
  )
}
