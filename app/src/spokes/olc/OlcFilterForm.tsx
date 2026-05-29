import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { OlcFacetCount, OlcFilterFields } from '@/lib/worker-client'

/**
 * Manual filter for the OLC spoke (v1 alpha).
 *
 * Axes per brief #2's v1 free-tier metadata floor: FTS over text + title /
 * author substring + source (DOJ-published vs Knight FOIA) + date range +
 * OCR quality. The curated AI flagships (the analytical/narrative
 * paradigmatic mode) land in a follow-up.
 *
 * Title comes first because many records have null author and the title
 * is the primary text axis. The source filter is genuinely useful: many
 * users will want to look at only the Knight FOIA net-new opinions (DOJ
 * never published them), or only the canonical DOJ-published archive.
 *
 * The OCR-quality filter defaults to "any" but exposes the option to
 * exclude degraded scans (~200 of 2,145) for serious research where text
 * accuracy matters.
 */
export function OlcFilterForm({
  sources,
  ocrQualities,
  loading,
  onSubmit,
}: {
  sources: readonly OlcFacetCount[]
  ocrQualities: readonly OlcFacetCount[]
  loading: boolean
  onSubmit: (fields: OlcFilterFields) => void
}) {
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [author, setAuthor] = useState('')
  const [source, setSource] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ocrQuality, setOcrQuality] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: OlcFilterFields = {}
    if (title.trim()) fields.title = title.trim()
    if (search.trim()) fields.search = search.trim()
    if (author.trim()) fields.author = author.trim()
    if (source) fields.source = source
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    if (ocrQuality) fields.ocrQuality = ocrQuality
    onSubmit(fields)
  }

  function handleClear() {
    setTitle('')
    setSearch('')
    setAuthor('')
    setSource('')
    setFrom('')
    setTo('')
    setOcrQuality('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field
        label="Title contains"
        hint="The primary text axis — many records have no author"
      >
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Authority, Constitutionality, Application of"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full-text search" hint="Opinion text + title">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. executive privilege, habeas corpus"
            disabled={loading}
          />
        </Field>
        <Field label="Author">
          <Input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Olson, Rehnquist"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Source">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="">— Any —</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {prettySource(s.value)} ({s.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issued from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Issued to">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
          />
        </Field>
      </div>

      <Field
        label="OCR quality"
        hint="Filter degraded scans out of serious research"
      >
        <select
          value={ocrQuality}
          onChange={(e) => setOcrQuality(e.target.value)}
          disabled={loading}
          className={cn(
            'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/40',
            loading && 'cursor-not-allowed opacity-60',
          )}
        >
          <option value="">— Any —</option>
          {ocrQualities.map((q) => (
            <option key={q.value} value={q.value}>
              {q.value} ({q.count.toLocaleString()})
            </option>
          ))}
        </select>
      </Field>

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

/** "doj-published" → "DOJ published"; "knight-foia" → "Knight FOIA". */
function prettySource(s: string): string {
  if (s === 'doj-published') return 'DOJ published'
  if (s === 'knight-foia') return 'Knight FOIA'
  return s
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
