import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type SanctionsFrFacets,
  type SanctionsFrFilterFields,
} from '@/lib/worker-client'

/**
 * Manual filter for the Federal Register sanctions slice (brief #15
 * decision #1: the BROAD slice — OFAC-agency documents + State FTO/SDGT
 * designation notices + anything citing a sanctions EO, selected live in
 * the fr corpus by the Worker's versioned predicate).
 *
 * This is the leg WITH the date axis the entity list lacks — designation
 * notices carry the "since when" the SDN snapshot cannot answer.
 */
export function SanctionsFrFilterForm({
  facets,
  loading,
  onSubmit,
  initialSearch,
}: {
  facets: SanctionsFrFacets | undefined
  loading: boolean
  onSubmit: (fields: SanctionsFrFilterFields) => void
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [docType, setDocType] = useState('')
  const [agencySlug, setAgencySlug] = useState('')
  const [eoNumber, setEoNumber] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: SanctionsFrFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (docType) fields.docType = docType
    if (agencySlug) fields.agencySlug = agencySlug
    const eo = Number(eoNumber)
    if (eoNumber && Number.isFinite(eo) && eo > 0) fields.eoNumber = Math.floor(eo)
    if (from) fields.from = from
    if (to) fields.to = to
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setDocType('')
    setAgencySlug('')
    setEoNumber('')
    setFrom('')
    setTo('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Full-text search" hint="titles + document text, within the sanctions slice">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. designation, blocking property, foreign terrorist organization"
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
            {(facets?.doc_types ?? []).map((t) => (
              <option key={t.value} value={t.value}>
                {prettyDocType(t.value)} ({t.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agency">
          <select
            value={agencySlug}
            onChange={(e) => setAgencySlug(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.agencies ?? []).map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name ?? a.slug} ({a.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cited executive order">
          <select
            value={eoNumber}
            onChange={(e) => setEoNumber(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.eo_numbers ?? []).map((eo) => (
              <option key={eo.value} value={String(eo.value)}>
                EO {eo.value} ({eo.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Published from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Published to">
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
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          A curated sanctions slice of the Federal Register — pre-1994 is
          absent; these documents also appear in the Federal Register corpus.
        </span>
      </div>
    </form>
  )
}

function prettyDocType(t: string): string {
  switch (t) {
    case 'rule':
      return 'Rule'
    case 'proposed_rule':
      return 'Proposed rule'
    case 'notice':
      return 'Notice'
    default:
      return t
  }
}

function selectCls(loading: boolean) {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    loading && 'cursor-not-allowed opacity-60',
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
