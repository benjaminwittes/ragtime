import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { UscFilterFields, UscTitle } from '@/lib/worker-client'

/**
 * Manual filter for the USC spoke (v1 alpha).
 *
 * Axes per brief #3 §3 (the free-tier metadata floor): FTS over text +
 * title number + canonical citation + heading substring + positive-law
 * toggle + status. No curated scopes library, no definitional layer, no
 * cross-corpus joins — those land in follow-ups.
 *
 * Citation lookup is the #1 USC entry path per brief #3 §1 question #2,
 * so the citation field is placed prominently and its placeholder shows
 * the canonical form ("8 U.S.C. § 1225").
 */
export function UscFilterForm({
  titles,
  statuses,
  loading,
  onSubmit,
}: {
  titles: readonly UscTitle[]
  statuses: readonly string[]
  loading: boolean
  onSubmit: (fields: UscFilterFields) => void
}) {
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState<string>('') // string for select value; coerced on submit
  const [citation, setCitation] = useState('')
  const [heading, setHeading] = useState('')
  const [positiveLaw, setPositiveLaw] = useState<'any' | 'yes' | 'no'>('any')
  const [status, setStatus] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: UscFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (title) fields.title = Number(title)
    if (citation.trim()) fields.citation = citation.trim()
    if (heading.trim()) fields.heading = heading.trim()
    if (positiveLaw === 'yes') fields.positiveLaw = true
    if (positiveLaw === 'no') fields.positiveLaw = false
    if (status) fields.status = status
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setTitle('')
    setCitation('')
    setHeading('')
    setPositiveLaw('any')
    setStatus('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      {/* Top row: citation (the #1 entry path) gets the spotlight. */}
      <Field
        label="Citation"
        hint="The canonical citation — exact match"
      >
        <Input
          type="text"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          placeholder="e.g. 8 U.S.C. § 1225"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full-text search" hint="Section text + heading">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. habeas corpus, asylum, antitrust"
            disabled={loading}
          />
        </Field>
        <Field label="Heading contains">
          <Input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g. Inspection"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Title">
          <select
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="">— Any —</option>
            {titles.map((t) => (
              <option key={t.num} value={t.num}>
                {t.num}. {prettyTitleName(t.name)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Positive law">
          <select
            value={positiveLaw}
            onChange={(e) =>
              setPositiveLaw(e.target.value as 'any' | 'yes' | 'no')
            }
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="any">— Any —</option>
            <option value="yes">Positive-law titles only</option>
            <option value="no">Non-positive only</option>
          </select>
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="">— Any —</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Filtering…' : 'Apply filter'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClear}
          disabled={loading}
        >
          Clear
        </Button>
      </div>
    </form>
  )
}

/**
 * USC titles publish in ALL CAPS; the dropdown reads better with title-case
 * conversion on display while preserving the canonical name on the data
 * layer.
 */
function prettyTitleName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
