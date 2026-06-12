import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  ClemencyFacetCount,
  ClemencyFilterFields,
} from '@/lib/worker-client'

/**
 * Manual filter for the clemency surface (brief #11 §7). Person-shaped axes:
 * recipient name / type / president / topic / district / provenance /
 * relationship / reoffended + FTS. The provenance filter is the auditability
 * axis — lets a researcher isolate the Wikipedia-derived names (the January 6
 * set DOJ recorded only as a class).
 */
export function ClemencyFilterForm({
  types,
  presidents,
  topics,
  loading,
  onSubmit,
  initialSearch,
}: {
  types: readonly ClemencyFacetCount[]
  presidents: readonly ClemencyFacetCount[]
  topics: readonly ClemencyFacetCount[]
  loading: boolean
  onSubmit: (fields: ClemencyFilterFields) => void
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [clemencyType, setClemencyType] = useState('')
  const [president, setPresident] = useState('')
  const [topic, setTopic] = useState('')
  const [district, setDistrict] = useState('')
  const [provenance, setProvenance] = useState('')
  const [reoffended, setReoffended] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: ClemencyFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (clemencyType) fields.clemencyType = clemencyType
    if (president) fields.president = president
    if (topic) fields.topic = topic
    if (district.trim()) fields.district = district.trim()
    if (provenance) fields.provenance = provenance
    if (reoffended) fields.reoffended = true
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setClemencyType('')
    setPresident('')
    setTopic('')
    setDistrict('')
    setProvenance('')
    setReoffended(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Search" hint="Recipient, offense, topic, district">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. drug, fraud, a recipient's name"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Type">
          <select value={clemencyType} onChange={(e) => setClemencyType(e.target.value)} disabled={loading} className={sel(loading)}>
            <option value="">— Any —</option>
            {types.map((t) => (
              <option key={t.value} value={t.value}>{t.value} ({t.count.toLocaleString()})</option>
            ))}
          </select>
        </Field>
        <Field label="President">
          <select value={president} onChange={(e) => setPresident(e.target.value)} disabled={loading} className={sel(loading)}>
            <option value="">— Any —</option>
            {presidents.map((p) => (
              <option key={p.value} value={p.value}>{p.value} ({p.count.toLocaleString()})</option>
            ))}
          </select>
        </Field>
        <Field label="Topic">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={loading} className={sel(loading)}>
            <option value="">— Any —</option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>{t.value} ({t.count.toLocaleString()})</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="District">
          <Input type="text" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. S.D.N.Y., D.C." disabled={loading} />
        </Field>
        <Field label="Source" hint="Provenance of the record">
          <select value={provenance} onChange={(e) => setProvenance(e.target.value)} disabled={loading} className={sel(loading)}>
            <option value="">— Any —</option>
            <option value="doj">DOJ warrant</option>
            <option value="wikipedia_derived">Wikipedia-derived (e.g. Jan 6)</option>
            <option value="whitehouse">White House</option>
          </select>
        </Field>
        <label className="flex items-end gap-2 pb-1.5 text-xs text-foreground">
          <input type="checkbox" checked={reoffended} onChange={(e) => setReoffended(e.target.checked)} disabled={loading} className="h-4 w-4" />
          <span>Reoffended after grant (documented)</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={loading}>{loading ? 'Filtering…' : 'Apply filter'}</Button>
        <Button type="button" variant="ghost" onClick={handleClear} disabled={loading}>Clear</Button>
      </div>
    </form>
  )
}

function sel(loading: boolean) {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    loading && 'cursor-not-allowed opacity-60',
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
