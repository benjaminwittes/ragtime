import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  CongressCollection,
  CongressCommitteeCount,
  CongressFilterFields,
} from '@/lib/worker-client'
import { prettyGranuleClass } from './congress-format'

/**
 * Manual filter for the Congress spoke (brief #13) — one form, five
 * collections. The always-on axes (FTS + congress number + date range)
 * render for every collection; the structured axes are collection-shaped:
 *   laws      — public/private kind
 *   bills     — origin chamber, became-law, policy area
 *   hearings  — chamber, committee (top committees from facets)
 *   record    — granule class, speaking-member bioguide id
 *   testimony — witness name
 *
 * The shell remounts this form on collection change (key={collection}),
 * so per-collection state resets cleanly.
 */
export function CongressFilterForm({
  collection,
  committees,
  granuleClasses,
  loading,
  onSubmit,
  initialSearch,
}: {
  collection: CongressCollection
  committees: readonly CongressCommitteeCount[]
  granuleClasses: readonly { value: string; count: number }[]
  loading: boolean
  onSubmit: (fields: CongressFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [congress, setCongress] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [chamber, setChamber] = useState('')
  const [committee, setCommittee] = useState('')
  const [becameLaw, setBecameLaw] = useState(false)
  const [policyArea, setPolicyArea] = useState('')
  const [lawKind, setLawKind] = useState('')
  const [granuleClass, setGranuleClass] = useState('')
  const [bioguideId, setBioguideId] = useState('')
  const [witness, setWitness] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: CongressFilterFields = { collection }
    if (search.trim()) fields.search = search.trim()
    const cong = Number(congress.trim())
    if (congress.trim() && Number.isFinite(cong) && cong > 0)
      fields.congress = cong
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    if (chamber) fields.chamber = chamber
    if (committee) fields.committee = committee
    if (becameLaw) fields.becameLaw = true
    if (policyArea.trim()) fields.policyArea = policyArea.trim()
    if (lawKind) fields.lawKind = lawKind
    if (granuleClass) fields.granuleClass = granuleClass
    if (bioguideId.trim()) fields.bioguideId = bioguideId.trim()
    if (witness.trim()) fields.witness = witness.trim()
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setCongress('')
    setFrom('')
    setTo('')
    setChamber('')
    setCommittee('')
    setBecameLaw(false)
    setPolicyArea('')
    setLawKind('')
    setGranuleClass('')
    setBioguideId('')
    setWitness('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Full-text search" hint={searchHint(collection)}>
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. foreign intelligence surveillance, Section 702"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Congress" hint="e.g. 118">
          <Input
            type="text"
            inputMode="numeric"
            value={congress}
            onChange={(e) => setCongress(e.target.value)}
            placeholder="e.g. 118"
            disabled={loading}
          />
        </Field>
        <Field label={`${dateLabel(collection)} from`}>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label={`${dateLabel(collection)} to`}>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
          />
        </Field>

        {collection === 'laws' && (
          <Field label="Law kind">
            <select
              value={lawKind}
              onChange={(e) => setLawKind(e.target.value)}
              disabled={loading}
              className={selectCls(loading)}
            >
              <option value="">— Any —</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </Field>
        )}

        {(collection === 'bills' || collection === 'hearings') && (
          <Field
            label="Chamber"
            hint={collection === 'bills' ? 'Origin chamber' : undefined}
          >
            <select
              value={chamber}
              onChange={(e) => setChamber(e.target.value)}
              disabled={loading}
              className={selectCls(loading)}
            >
              <option value="">— Any —</option>
              <option value="House">House</option>
              <option value="Senate">Senate</option>
            </select>
          </Field>
        )}

        {collection === 'record' && (
          <Field label="Section">
            <select
              value={granuleClass}
              onChange={(e) => setGranuleClass(e.target.value)}
              disabled={loading}
              className={selectCls(loading)}
            >
              <option value="">— Any —</option>
              {granuleClasses.map((g) => (
                <option key={g.value} value={g.value}>
                  {prettyGranuleClass(g.value)} ({g.count.toLocaleString()})
                </option>
              ))}
            </select>
          </Field>
        )}

        {collection === 'testimony' && (
          <Field label="Witness" hint="Name fragment">
            <Input
              type="text"
              value={witness}
              onChange={(e) => setWitness(e.target.value)}
              placeholder="e.g. Goitein"
              disabled={loading}
            />
          </Field>
        )}
      </div>

      {collection === 'hearings' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Committee" hint="Top committees by hearing count">
            <select
              value={committee}
              onChange={(e) => setCommittee(e.target.value)}
              disabled={loading}
              className={selectCls(loading)}
            >
              <option value="">— Any —</option>
              {committees.map((c) => (
                <option key={c.committee} value={c.committee}>
                  {c.committee} ({c.count.toLocaleString()})
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {collection === 'bills' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Policy area" hint="CRS term — e.g. Law">
            <Input
              type="text"
              value={policyArea}
              onChange={(e) => setPolicyArea(e.target.value)}
              placeholder="e.g. Armed Forces and National Security"
              disabled={loading}
            />
          </Field>
          <Field label="Sponsor bioguide ID" hint="e.g. P000605">
            <Input
              type="text"
              value={bioguideId}
              onChange={(e) => setBioguideId(e.target.value)}
              placeholder="e.g. P000605"
              disabled={loading}
            />
          </Field>
          <CheckboxField
            label="Became law"
            hint="Enacted bills only"
            checked={becameLaw}
            onChange={setBecameLaw}
            disabled={loading}
          />
        </div>
      )}

      {collection === 'record' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Member bioguide ID" hint="Speaking member — e.g. R000584">
            <Input
              type="text"
              value={bioguideId}
              onChange={(e) => setBioguideId(e.target.value)}
              placeholder="e.g. R000584"
              disabled={loading}
            />
          </Field>
        </div>
      )}

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

function searchHint(c: CongressCollection): string {
  switch (c) {
    case 'laws':
      return 'Statute text + title'
    case 'bills':
      return 'Bill text + title + summary'
    case 'hearings':
      return 'Transcript text + title'
    case 'record':
      return 'Floor text + title'
    case 'testimony':
      return 'Statement text'
  }
}

function dateLabel(c: CongressCollection): string {
  switch (c) {
    case 'laws':
      return 'Approved'
    case 'bills':
      return 'Introduced'
    case 'hearings':
      return 'Held'
    case 'record':
      return 'Record date'
    case 'testimony':
      return 'Statement'
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

function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
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
      <span className="flex h-9 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className={cn(
            'h-4 w-4 rounded border-border accent-primary',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        />
      </span>
    </label>
  )
}
