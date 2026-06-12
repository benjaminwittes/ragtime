import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  PresidentialFacetCount,
  PresidentialFilterFields,
  PresidentialPresidentCount,
} from '@/lib/worker-client'

/**
 * Manual filter for the Presidential Documents spoke (brief #11 §2).
 *
 * Axes: FTS + title substring + document type + president + direct
 * EO/proclamation number lookup + implementing-agency substring + signing-
 * date range + text quality. All facets are 100% populated (contrast OLC) —
 * no enrichment backfill gates parity.
 *
 * The number-lookup field handles the entry question ("what does EO 14239
 * say") without making the user guess at title phrasing. The text-quality
 * filter lets users exclude the pre-1948 metadata-only finding aids when
 * full-text reading matters.
 */
export function PresidentialFilterForm({
  docTypes,
  presidents,
  loading,
  onSubmit,
  initialSearch,
}: {
  docTypes: readonly PresidentialFacetCount[]
  presidents: readonly PresidentialPresidentCount[]
  loading: boolean
  onSubmit: (fields: PresidentialFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('')
  const [president, setPresident] = useState('')
  const [number, setNumber] = useState('')
  const [agency, setAgency] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [textQuality, setTextQuality] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: PresidentialFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (title.trim()) fields.title = title.trim()
    if (docType) fields.docType = docType
    if (president) fields.president = president
    const n = Number(number.trim())
    if (number.trim() && Number.isFinite(n) && n > 0) {
      // One number box serves both numbered types; route it by the selected
      // document type, defaulting to EO (the overwhelmingly common lookup).
      if (docType === 'proclamation') fields.proclamationNumber = n
      else fields.eoNumber = n
    }
    if (agency.trim()) fields.agency = agency.trim()
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    if (textQuality) fields.textQuality = textQuality
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setTitle('')
    setDocType('')
    setPresident('')
    setNumber('')
    setAgency('')
    setFrom('')
    setTo('')
    setTextQuality('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Full-text search" hint="Document text + title + citation">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. national emergency, suspension of entry, classified information"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Document type">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {docTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {prettyDocType(t.value)} ({t.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="President">
          <select
            value={president}
            onChange={(e) => setPresident(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {presidents.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="EO / proclamation #"
          hint="Direct lookup, e.g. 12333"
        >
          <Input
            type="text"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="e.g. 14239"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title contains">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. United States Intelligence Activities"
            disabled={loading}
          />
        </Field>
        <Field label="Agency" hint="Implementing agency">
          <Input
            type="text"
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="e.g. Homeland Security, State"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Signed from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Signed to">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field
          label="Text availability"
          hint="Pre-1948 EOs are finding aids only"
        >
          <select
            value={textQuality}
            onChange={(e) => setTextQuality(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            <option value="clean">Full text (Federal Register)</option>
            <option value="juris_backfill">Full text (DOJ JURIS backfill)</option>
            <option value="metadata_only">Finding aid only (no text)</option>
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

function selectCls(loading: boolean) {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    loading && 'cursor-not-allowed opacity-60',
  )
}

/** 'executive_order' → 'Executive orders', etc. */
function prettyDocType(s: string): string {
  switch (s) {
    case 'executive_order':
      return 'Executive orders'
    case 'proclamation':
      return 'Proclamations'
    case 'memorandum':
      return 'Memoranda'
    case 'determination':
      return 'Determinations'
    case 'notice':
      return 'Notices'
    default:
      return s
  }
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
