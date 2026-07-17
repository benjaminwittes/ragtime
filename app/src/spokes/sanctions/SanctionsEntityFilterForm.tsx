import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type SanctionsEntityFacets,
  type SanctionsEntityFilterFields,
} from '@/lib/worker-client'
import { entityTypeLabel, listTypeLabel } from './sanctions-format'

/**
 * Manual filter for the Sanctions ENTITY pane (brief #15 decision #2 — the
 * marquee surface).
 *
 * Axes: alias-aware name search (the Worker combines FTS with a substring
 * match over the search blob, so partial names and a.k.a. spellings hit) +
 * program + executive order + list type + entity type. Deliberately NO date
 * control — the entity table has no date axis worth filtering (publish_date
 * is the copy's freshness stamp, one value corpus-wide, not a designation
 * date).
 */
export function SanctionsEntityFilterForm({
  facets,
  loading,
  onSubmit,
  initialSearch,
}: {
  facets: SanctionsEntityFacets | undefined
  loading: boolean
  onSubmit: (fields: SanctionsEntityFilterFields) => void
  /** Seed for the search field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [program, setProgram] = useState('')
  const [eoNumber, setEoNumber] = useState('')
  const [listType, setListType] = useState('')
  const [entityType, setEntityType] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: SanctionsEntityFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (program) fields.program = program
    const eo = Number(eoNumber)
    if (eoNumber && Number.isFinite(eo) && eo > 0) fields.eoNumber = Math.floor(eo)
    if (listType) fields.listType = listType
    if (entityType) fields.entityType = entityType
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setProgram('')
    setEoNumber('')
    setListType('')
    setEntityType('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field
        label="Name or alias"
        hint="alias-aware — a.k.a. spellings and partial names match"
      >
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Wagner, Rosneft, Islamic Revolutionary Guard Corps"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
        <Field label="List">
          <select
            value={listType}
            onChange={(e) => setListType(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.list_types ?? []).map((lt) => (
              <option key={lt.value} value={lt.value}>
                {listTypeLabel(lt.value)} ({lt.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.entity_types ?? []).map((et) => (
              <option key={et.value} value={et.value}>
                {entityTypeLabel(et.value)} ({et.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search the lists'}
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
          No date filter — the list snapshot has no designation dates;
          &ldquo;since when&rdquo; lives in the Federal Register tab.
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
