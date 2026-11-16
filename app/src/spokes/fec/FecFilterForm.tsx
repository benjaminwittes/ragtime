import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FecFacetCount, FecFacets, FecFilterFields, FecKind } from '@lawfare/ragtime-client'
import {
  CANDIDATE_STATUS_LABELS,
  COMMITTEE_TYPE_LABELS,
  DESIGNATION_LABELS,
  FEC_CYCLE_NOTE,
  OFFICE_LABELS,
  PARTY_LABELS,
  codeLabel,
  cycleLabel,
  fecCycleOptions,
} from './fec-format'

/**
 * Manual filter for the FEC spoke: a kind toggle (candidate IDs or committee
 * IDs), a name-or-ID search, one cycle or a cycle range, and the contract's
 * filters for that kind, with facet counts (distinct IDs) beside each option.
 *
 * Every option carries the RAW FEC code; the plain label sits beside the code
 * and never replaces it.
 */
export function FecFilterForm({
  kind,
  onKindChange,
  facets,
  loading,
  onSubmit,
  initialSearch,
}: {
  kind: FecKind
  onKindChange: (kind: FecKind) => void
  /** Facets for the current kind; undefined while they load. */
  facets: FecFacets | undefined
  loading: boolean
  onSubmit: (fields: FecFilterFields) => void
  /** Seed for the search box (hub carryover, `?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [cycleMode, setCycleMode] = useState<'one' | 'range'>('one')
  const [cycle, setCycle] = useState('')
  const [cycleFrom, setCycleFrom] = useState('')
  const [cycleTo, setCycleTo] = useState('')
  const [office, setOffice] = useState('')
  const [state, setState] = useState('')
  const [party, setParty] = useState('')
  const [status, setStatus] = useState('')
  const [electionYear, setElectionYear] = useState('')
  const [cmteType, setCmteType] = useState('')
  const [designation, setDesignation] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: FecFilterFields = { kind }
    if (search.trim()) fields.search = search.trim()
    if (cycleMode === 'one' && cycle) fields.cycle = Number(cycle)
    if (cycleMode === 'range') {
      if (cycleFrom) fields.cycleFrom = Number(cycleFrom)
      if (cycleTo) fields.cycleTo = Number(cycleTo)
    }
    if (party) fields.party = party
    if (state.trim()) fields.state = state.trim().toUpperCase()
    if (kind === 'candidate') {
      if (office) fields.office = office
      if (status) fields.status = status
      if (/^\d{4}$/.test(electionYear.trim())) fields.electionYear = Number(electionYear.trim())
    } else {
      if (cmteType) fields.cmteType = cmteType
      if (designation) fields.designation = designation
    }
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setCycle('')
    setCycleFrom('')
    setCycleTo('')
    setOffice('')
    setState('')
    setParty('')
    setStatus('')
    setElectionYear('')
    setCmteType('')
    setDesignation('')
  }

  const f = facets?.kind === kind ? facets.facets : undefined
  const cycleOptions = cycleValues(f?.cycle)
  const idNoun = kind === 'candidate' ? 'candidate IDs' : 'committee IDs'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-b border-border bg-card px-6 py-5">
      <div role="radiogroup" aria-label="Search" className="inline-flex rounded-md border border-border p-0.5">
        {(['candidate', 'committee'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            disabled={loading}
            onClick={() => onKindChange(k)}
            className={cn(
              'rounded px-3 py-1 text-sm',
              kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {k === 'candidate' ? 'Candidates' : 'Committees'}
          </button>
        ))}
      </div>

      <Field
        label={kind === 'candidate' ? 'Candidate name or ID' : 'Committee name or ID'}
        hint={kind === 'candidate' ? 'e.g. warnock, or S0GA00559' : 'e.g. victory fund, or C00123456'}
      >
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kind === 'candidate' ? 'Name words or a candidate ID' : 'Name, connected organization or a committee ID'}
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Cycle" hint={`counts are ${idNoun}`} group>
          <div className="space-y-2">
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="fec-cycle-mode"
                  checked={cycleMode === 'one'}
                  onChange={() => setCycleMode('one')}
                  disabled={loading}
                />
                One cycle
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="fec-cycle-mode"
                  checked={cycleMode === 'range'}
                  onChange={() => setCycleMode('range')}
                  disabled={loading}
                />
                Range of cycles
              </label>
            </div>
            {cycleMode === 'one' ? (
              <select
                aria-label="Cycle"
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                disabled={loading}
                className={selectCls(loading)}
              >
                <option value="">— Any cycle —</option>
                {cycleOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {cycleLabel(c.value)}
                    {count(c.count)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  aria-label="From cycle"
                  value={cycleFrom}
                  onChange={(e) => setCycleFrom(e.target.value)}
                  disabled={loading}
                  className={selectCls(loading)}
                >
                  <option value="">— From —</option>
                  {cycleOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {cycleLabel(c.value)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">to</span>
                <select
                  aria-label="To cycle"
                  value={cycleTo}
                  onChange={(e) => setCycleTo(e.target.value)}
                  disabled={loading}
                  className={selectCls(loading)}
                >
                  <option value="">— To —</option>
                  {cycleOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {cycleLabel(c.value)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Field>

        {kind === 'candidate' ? (
          <>
            <Field label="Office" hint="CAND_OFFICE">
              <CodeSelect value={office} onChange={setOffice} loading={loading} options={f?.office} labels={OFFICE_LABELS} fallback={['H', 'S', 'P']} />
            </Field>
            <Field label="State" hint="CAND_OFFICE_ST">
              <CodeSelect value={state} onChange={setState} loading={loading} options={f?.state} labels={{}} free />
            </Field>
            <Field label="Party" hint="CAND_PTY_AFFILIATION">
              <CodeSelect value={party} onChange={setParty} loading={loading} options={f?.party} labels={PARTY_LABELS} free />
            </Field>
            <Field label="Status" hint="CAND_STATUS">
              <CodeSelect value={status} onChange={setStatus} loading={loading} options={f?.status} labels={CANDIDATE_STATUS_LABELS} fallback={['C', 'F', 'N', 'P']} />
            </Field>
            <Field label="Election year" hint="CAND_ELECTION_YR">
              <Input
                type="text"
                inputMode="numeric"
                value={electionYear}
                onChange={(e) => setElectionYear(e.target.value)}
                placeholder="e.g. 2022"
                disabled={loading}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Committee type" hint="CMTE_TP">
              <CodeSelect value={cmteType} onChange={setCmteType} loading={loading} options={f?.cmteType} labels={COMMITTEE_TYPE_LABELS} fallback={Object.keys(COMMITTEE_TYPE_LABELS)} />
            </Field>
            <Field label="Designation" hint="CMTE_DSGN">
              <CodeSelect value={designation} onChange={setDesignation} loading={loading} options={f?.designation} labels={DESIGNATION_LABELS} fallback={Object.keys(DESIGNATION_LABELS)} />
            </Field>
            <Field label="Party" hint="CMTE_PTY_AFFILIATION">
              <CodeSelect value={party} onChange={setParty} loading={loading} options={f?.party} labels={PARTY_LABELS} free />
            </Field>
            <Field label="State" hint="CMTE_ST">
              <Input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. DC"
                maxLength={2}
                disabled={loading}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
        <Button type="button" variant="ghost" onClick={handleClear} disabled={loading}>
          Clear
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground/70">{FEC_CYCLE_NOTE}</span>
      </div>
    </form>
  )
}

const count = (n: number | string | undefined) =>
  n == null ? '' : ` — ${Number(n).toLocaleString('en-US')}`

/** Facet cycle values, newest first; every even year 1980–2026 until facets load. */
function cycleValues(facet: FecFacetCount[] | undefined): { value: number; count?: number }[] {
  if (facet && facet.length > 0) {
    return facet
      .map((c) => ({ value: Number(c.value), count: c.count }))
      .filter((c) => Number.isInteger(c.value))
      .sort((a, b) => b.value - a.value)
  }
  return fecCycleOptions().map((value) => ({ value }))
}

/**
 * A select of FEC codes. Options come from the facets (with counts); before
 * they load, from `fallback`. A `free` select (state, party) with no facets
 * yet falls back to a text box, since its codes are open-ended.
 */
function CodeSelect({
  value,
  onChange,
  loading,
  options,
  labels,
  fallback,
  free,
}: {
  value: string
  onChange: (v: string) => void
  loading: boolean
  options: FecFacetCount[] | undefined
  labels: Record<string, string>
  fallback?: string[]
  free?: boolean
}) {
  const list: { value: string; count?: number }[] =
    options && options.length > 0
      ? options.filter((o) => o.value !== null && String(o.value) !== '').map((o) => ({ value: String(o.value), count: o.count }))
      : (fallback ?? []).map((v) => ({ value: v }))
  if (list.length === 0 && free) {
    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="FEC code"
        disabled={loading}
      />
    )
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
      className={selectCls(loading)}
    >
      <option value="">— Any —</option>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {codeLabel(o.value, labels)}
          {count(o.count)}
        </option>
      ))}
    </select>
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
  group,
  children,
}: {
  label: string
  hint?: string
  /** A group of controls (radios, two selects): a div, not a label. */
  group?: boolean
  children: React.ReactNode
}) {
  const heading = (
    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
      {hint && <span className="ml-2 font-mono normal-case text-[10px] text-muted-foreground/70">{hint}</span>}
    </span>
  )
  if (group) {
    return (
      <div role="group" aria-label={label} className="block space-y-1.5">
        {heading}
        {children}
      </div>
    )
  }
  return (
    <label className="block space-y-1.5">
      {heading}
      {children}
    </label>
  )
}
