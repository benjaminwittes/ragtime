import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type SanctionsGuidanceFacets,
  type SanctionsGuidanceFilterFields,
} from '@/lib/worker-client'
import { guidanceTypeLabel } from './sanctions-format'

/**
 * Manual filter for the OFAC guidance leg (brief #15): FTS + guidance type
 * + program + executive order + issued-date range.
 *
 * The undated-docs candor rides on the date row: 31 documents carry no
 * issued_date, and any date bound silently excludes them — so the form says
 * so where the user sets the bound.
 */
export function SanctionsGuidanceFilterForm({
  facets,
  loading,
  onSubmit,
  initialSearch,
}: {
  facets: SanctionsGuidanceFacets | undefined
  loading: boolean
  onSubmit: (fields: SanctionsGuidanceFilterFields) => void
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [guidanceType, setGuidanceType] = useState('')
  const [program, setProgram] = useState('')
  const [eoNumber, setEoNumber] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: SanctionsGuidanceFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (guidanceType) fields.guidanceType = guidanceType
    if (program) fields.program = program
    const eo = Number(eoNumber)
    if (eoNumber && Number.isFinite(eo) && eo > 0) fields.eoNumber = Math.floor(eo)
    if (from) fields.from = from
    if (to) fields.to = to
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setGuidanceType('')
    setProgram('')
    setEoNumber('')
    setFrom('')
    setTo('')
  }

  const undated = facets?.undated_count

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Full-text search" hint="titles + document text">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. 50 percent rule, general license, wind-down"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Guidance type">
          <select
            value={guidanceType}
            onChange={(e) => setGuidanceType(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.guidance_types ?? []).map((t) => (
              <option key={t.value} value={t.value}>
                {guidanceTypeLabel(t.value)} ({t.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Program">
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.programs ?? []).map((p) => (
              <option key={p.value} value={p.value}>
                {p.value} ({p.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Executive order">
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
        <Field label="Issued from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field
          label="Issued to"
          hint={
            undated
              ? `date bounds exclude the ${undated.toLocaleString()} undated documents`
              : undefined
          }
        >
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
          OFAC-published guidance only — the sanctions regulations (31 CFR
          ch. V) live in the CFR corpus.
        </span>
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
