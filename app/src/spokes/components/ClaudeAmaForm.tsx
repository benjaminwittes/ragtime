import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Brief #6 §0 decision 3 — agentic AMA ("ask me anything") ported wholesale.
 *
 * Free-form natural-language input. The Worker plans a strategy (planning
 * LLM call), shows a pre-flight modal when the estimate exceeds the
 * threshold, then executes + synthesizes. Three output shapes: list,
 * narrative, hybrid — the agent picks per question.
 *
 * Unlike claude_read / claude_analysis, AMA works on EMPTY scope: an empty
 * scope means "the full corpus." So this form does NOT gate on scopeSize.
 *
 * Placeholder is question-flavored (the AMA mode is the closest to the
 * "free-form opportunity to direct the AI in any direction" UX principle —
 * Ben's 2026-05-27 framing).
 */
export type AmaLogStatus = 'pending' | 'done' | 'error'

export type AmaLogLine = {
  label: string
  message: string
  status?: AmaLogStatus
}

export function ClaudeAmaForm({
  loading,
  byokConfigured,
  scopeSize,
  log,
  onSubmit,
}: {
  loading: boolean
  byokConfigured: boolean
  /** Current scope size. 0 = full corpus; >0 = narrow to the current page's
   *  rows. Surfaced as a copy hint in the form (not a gate). */
  scopeSize: number
  /** Session log lines driven by the shell — Planning / Plan / Executing /
   *  Done. The form just renders them; the shell owns the lifecycle. */
  log: readonly AmaLogLine[]
  onSubmit: (question: string) => void
}) {
  const [question, setQuestion] = useState('')

  const disabled = loading || !byokConfigured
  const canSubmit = !disabled && question.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(question.trim())
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
      {byokConfigured && scopeSize === 0 && (
        <Banner kind="info">
          No filter applied — Ask will run over the full corpus.
        </Banner>
      )}
      {byokConfigured && scopeSize > 0 && (
        <Banner kind="info">
          Asking within the current{' '}
          <span className="font-medium">
            {scopeSize.toLocaleString()} cases
          </span>
          . Clear the filter to ask over the full corpus.
        </Banner>
      )}

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Question
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            AI plans queries, runs them, and answers — narrows the field,
            gives a narrative, or both
          </span>
        </span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="e.g. Are drug prosecutions up or down since the start of the year? Or: show me cases where states are suing the federal government over federalism. Or: how badly is ICE doing in immigration litigation?"
          className={cn(
            'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {loading ? 'Working…' : 'Ask'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={loading || !question}
          onClick={() => setQuestion('')}
        >
          Clear
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          AI plans → may ask before spending → runs queries → answers
        </span>
      </div>

      {log.length > 0 && <SessionLog log={log} />}
    </form>
  )
}

/**
 * Inline session log. Shows step-by-step progress so the user can see what
 * the agent is doing during the ~10–30 second planning + execution loop.
 * Mirrors the legacy index.html `.ama-log` panel.
 */
function SessionLog({ log }: { log: readonly AmaLogLine[] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="max-h-60 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
    >
      {log.map((line, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-2 py-0.5',
            line.status === 'error' && 'text-destructive',
            line.status === 'done' && 'text-foreground',
            (!line.status || line.status === 'pending') &&
              'text-muted-foreground',
          )}
        >
          <span className="font-medium text-foreground">{line.label}</span>
          <span className="flex-1">{line.message}</span>
        </div>
      ))}
    </div>
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
