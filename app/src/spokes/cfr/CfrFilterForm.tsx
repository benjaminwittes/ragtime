import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CfrFilterFields, CfrTitle } from '@/lib/worker-client'

/**
 * Manual filter for the CFR spoke (v1 alpha).
 *
 * Axes per brief #4's v1 free-tier metadata floor: FTS over text + title +
 * canonical citation + heading substring + part exact match + reserved
 * toggle. Curated scopes library (rule packages + agency-derived) and the
 * three flagship AI tasks (compliance / authority / framework synthesis)
 * land in follow-ups.
 *
 * Citation lookup gets the spotlight, same as USC — the "what does
 * §X.Y say?" question is just as prominent for regulations as for
 * statutes. Reserved-toggle defaults to "exclude reserved" because most
 * users won't want placeholder sections cluttering results.
 */
export function CfrFilterForm({
  titles,
  loading,
  onSubmit,
  initialSearch,
}: {
  titles: readonly CfrTitle[]
  loading: boolean
  onSubmit: (fields: CfrFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [title, setTitle] = useState<string>('')
  const [citation, setCitation] = useState('')
  const [heading, setHeading] = useState('')
  const [part, setPart] = useState('')
  const [reserved, setReserved] = useState<'exclude' | 'any' | 'only'>('exclude')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: CfrFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (title) fields.title = Number(title)
    if (citation.trim()) fields.citation = citation.trim()
    if (heading.trim()) fields.heading = heading.trim()
    if (part.trim()) fields.part = part.trim()
    if (reserved === 'exclude') fields.reserved = false
    if (reserved === 'only') fields.reserved = true
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setTitle('')
    setCitation('')
    setHeading('')
    setPart('')
    setReserved('exclude')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Citation" hint="The canonical citation — exact match">
        <Input
          type="text"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          placeholder="e.g. 45 CFR 164.502"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full-text search" hint="Section text + heading">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. privacy, NEPA, mortgage disclosure"
            disabled={loading}
          />
        </Field>
        <Field label="Heading contains">
          <Input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g. Definitions"
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

        <Field label="Part" hint="Exact match, e.g. 164">
          <Input
            type="text"
            value={part}
            onChange={(e) => setPart(e.target.value)}
            placeholder="e.g. 164"
            disabled={loading}
          />
        </Field>

        <Field label="Reserved sections">
          <select
            value={reserved}
            onChange={(e) =>
              setReserved(e.target.value as 'exclude' | 'any' | 'only')
            }
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="exclude">Exclude reserved</option>
            <option value="any">Include reserved</option>
            <option value="only">Only reserved</option>
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

/** CFR titles publish in ALL CAPS too — same Title Case conversion as USC. */
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
