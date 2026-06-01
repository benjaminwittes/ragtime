import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  FrusClassificationCount,
  FrusFilterFields,
} from '@/lib/worker-client'

/**
 * Manual filter for the FRUS spoke (v1 alpha).
 *
 * Axes per brief #5's v1 free-tier metadata floor: FTS, title substring,
 * sub-series dropdown (≈102 values — the natural FRUS browse spine),
 * classification dropdown, volume_id exact, place substring, and date
 * range on doc_date. The flagship analytical "Tell me about [event] in
 * [period]" surface lands in a follow-up.
 *
 * Sub-series filters via a JOIN through frus_volumes server-side, so
 * users can scope to "1969-1976" or "Truman" without typing a SQL
 * predicate. Classification is exposed because users often care about
 * the "originally Top Secret" stories specifically — both for narrative
 * weight and because the corpus is dominated by classified documents
 * (Secret + Top Secret + Confidential together are ~65K of the 67K
 * classified).
 */
export function FrusFilterForm({
  subSeries,
  classifications,
  loading,
  onSubmit,
  initialSearch,
}: {
  subSeries: readonly string[]
  classifications: readonly FrusClassificationCount[]
  loading: boolean
  onSubmit: (fields: FrusFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState(initialSearch ?? '')
  const [selectedSubSeries, setSelectedSubSeries] = useState('')
  const [classification, setClassification] = useState('')
  const [volumeId, setVolumeId] = useState('')
  const [place, setPlace] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: FrusFilterFields = {}
    if (title.trim()) fields.title = title.trim()
    if (search.trim()) fields.search = search.trim()
    if (selectedSubSeries) fields.subSeries = selectedSubSeries
    if (classification) fields.classification = classification
    if (volumeId.trim()) fields.volumeId = volumeId.trim()
    if (place.trim()) fields.place = place.trim()
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    onSubmit(fields)
  }

  function handleClear() {
    setTitle('')
    setSearch('')
    setSelectedSubSeries('')
    setClassification('')
    setVolumeId('')
    setPlace('')
    setFrom('')
    setTo('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Title contains">
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Memorandum, Telegram, NSC Meeting"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full-text search" hint="Document text + title">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Cuban missile, Khrushchev, Suez"
            disabled={loading}
          />
        </Field>
        <Field label="Place contains" hint="Origin location">
          <Input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Havana, Moscow, Saigon"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Sub-series"
          hint="The natural FRUS browse spine"
        >
          <select
            value={selectedSubSeries}
            onChange={(e) => setSelectedSubSeries(e.target.value)}
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="">— Any —</option>
            {subSeries.map((ss) => (
              <option key={ss} value={ss}>
                {ss}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Volume ID" hint="Exact match, e.g. frus1969-76v01">
          <Input
            type="text"
            value={volumeId}
            onChange={(e) => setVolumeId(e.target.value)}
            placeholder="e.g. frus1969-76v01"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Classification">
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            disabled={loading}
            className={cn(
              'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              loading && 'cursor-not-allowed opacity-60',
            )}
          >
            <option value="">— Any —</option>
            {classifications.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dated from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Dated to">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
          />
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
