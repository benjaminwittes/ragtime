import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Brief #6 §0 decision 3 — `claude_read` mode ported wholesale.
 *
 * User supplies a per-case criterion ("cases where the plaintiff is a state
 * suing a federal agency"); the orchestrator reads each case's docket
 * entries against that criterion and decides keep/drop with a reason.
 *
 * The placeholder text is mechanic-flavored, not narrative-flavored, per
 * brief #6 §7c (rewriting the legacy "the court ordered the government to
 * do something and the government didn't comply" presupposed-non-compliance
 * framing).
 *
 * v1 (PR 4e, this PR): BYOK-only, gated by `byokConfigured`. Disabled when
 * there are no cases in scope (read mode operates on the current result
 * page).
 *
 * Search-depth toggle (brief #6 decision 8) — UI affordance is here per the
 * "visible and prominent, not buried" requirement. Today the Worker only
 * reads docket-entry descriptions, so the `full-doc` option is rendered
 * disabled with an explanation. When the documents.text_content backfill
 * (harvest-pcg agent) is complete and the Worker exposes a full-doc read
 * path, flip the `fullDocAvailable` flag to true.
 */

export type SearchDepth = 'docket-only' | 'full-doc'

const FULL_DOC_AVAILABLE = false // server-side wiring lands separately

export function ClaudeReadForm({
  loading,
  byokConfigured,
  scopeSize,
  onSubmit,
  progressLabel,
}: {
  loading: boolean
  byokConfigured: boolean
  /** Number of cases in the current scope. Read mode operates on these. */
  scopeSize: number
  onSubmit: (criterion: string, searchDepth: SearchDepth) => void
  /** Live progress, e.g. "Reading 50 / 200 cases…". Empty/undefined when
   *  no read is in flight. */
  progressLabel?: string
}) {
  const [criterion, setCriterion] = useState('')
  const [searchDepth] = useState<SearchDepth>('docket-only')

  const scopeEmpty = scopeSize === 0
  const disabled = loading || !byokConfigured || scopeEmpty
  const canSubmit = !disabled && criterion.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(criterion.trim(), searchDepth)
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
          Read mode operates on the current result page. Run a filter or AI
          writes SQL first to populate the field.
        </Banner>
      )}

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Per-case criterion
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            AI reads each case's docket entries and keeps/drops
          </span>
        </span>
        <textarea
          value={criterion}
          onChange={(e) => setCriterion(e.target.value)}
          rows={4}
          disabled={disabled}
          placeholder="e.g. cases where the court ordered the government to take or refrain from a specific action; or: cases where there's a sealed filing in the last 30 days"
          className={cn(
            'block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </label>

      <SearchDepthControl value={searchDepth} disabled={disabled} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {loading
            ? 'Reading…'
            : `Read ${scopeSize.toLocaleString()} case${scopeSize === 1 ? '' : 's'}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={loading || !criterion}
          onClick={() => setCriterion('')}
        >
          Clear
        </Button>
        {progressLabel && (
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground"
          >
            {progressLabel}
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Search-depth toggle per brief #6 decision 8.
 *
 * Visible and prominent — the field is shown as a labeled fieldset with two
 * radio options. `docket-only` is selected and disabled-locked at v1; the
 * `full-doc` option renders disabled with a "coming when documents indexed"
 * tag. When the Worker grows full-doc support and the `documents.text_content`
 * backfill catches up, flip `FULL_DOC_AVAILABLE` above.
 */
function SearchDepthControl({
  value,
  disabled,
}: {
  value: SearchDepth
  disabled: boolean
}) {
  return (
    <fieldset className="block space-y-1.5" disabled={disabled || !FULL_DOC_AVAILABLE}>
      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Search depth
        <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
          How much per-case context the AI reads
        </span>
      </legend>
      <div className="flex flex-wrap gap-3 pt-1">
        <DepthOption
          name="docket-only"
          label="Docket entries"
          description="Cheaper / faster. Reads each case's docket entry descriptions."
          checked={value === 'docket-only'}
          enabled
        />
        <DepthOption
          name="full-doc"
          label="Full documents"
          description="OCR'd PDF text per case. More substantive; more expensive."
          checked={value === 'full-doc'}
          enabled={FULL_DOC_AVAILABLE}
          unavailableHint="available once attached document text is indexed"
        />
      </div>
    </fieldset>
  )
}

function DepthOption({
  name,
  label,
  description,
  checked,
  enabled,
  unavailableHint,
}: {
  name: string
  label: string
  description: string
  checked: boolean
  enabled: boolean
  unavailableHint?: string
}) {
  return (
    <label
      className={cn(
        'flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm',
        checked && 'border-primary bg-primary/5',
        !enabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="radio"
        name="search-depth"
        value={name}
        checked={checked}
        disabled={!enabled}
        readOnly
        className="mt-0.5 h-3.5 w-3.5"
      />
      <span className="flex-1">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
        {!enabled && unavailableHint && (
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {unavailableHint}
          </span>
        )}
      </span>
    </label>
  )
}

function Banner({
  kind,
  children,
}: {
  kind: 'info' | 'error'
  children: React.ReactNode
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        kind === 'info' &&
          'border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200',
        kind === 'error' &&
          'border-destructive/50 bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </div>
  )
}
