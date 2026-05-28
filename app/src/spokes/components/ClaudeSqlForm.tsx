import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Brief #6 §0 decision 3 — `claude_sql` mode ported wholesale.
 *
 * User describes the filter in natural language; the Worker's /corpus/sql
 * endpoint asks Claude for the equivalent SQL and runs it. Per brief #6 §7c
 * the placeholder text is mechanic-flavored (neutral about the corpus), not
 * narrative-flavored (presupposing a story).
 *
 * v1 (PR 4d, this PR): BYOK-only. The mode-row in the SpokeShell disables
 * this mode until the user configures a BYOK key in AccessSettings.
 */
export function ClaudeSqlForm({
  loading,
  byokConfigured,
  onSubmit,
}: {
  loading: boolean
  byokConfigured: boolean
  onSubmit: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || loading || !byokConfigured) return
    onSubmit(trimmed)
  }

  function clear() {
    setPrompt('')
  }

  const disabled = loading || !byokConfigured

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 border-b border-border bg-card px-6 py-5"
    >
      {!byokConfigured && (
        <div
          role="status"
          className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          Configure an API key in <span className="font-medium">AI access</span>{' '}
          (header, top right) to use this mode. Your key is sent to the
          Cloudflare Worker, which forwards your prompt to the provider.
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Describe a filter
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            Natural language → SQL
          </span>
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="e.g. cases where the court ordered the government to take or refrain from a specific action; or: APA challenges with TROs granted in 2025"
          className={cn(
            'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={disabled || !prompt.trim()}>
          {loading ? 'Generating…' : 'Generate query'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={clear}
          disabled={loading || !prompt}
        >
          Clear
        </Button>
      </div>
    </form>
  )
}
