import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  FrAgencyCount,
  FrFacetCount,
  FrFilterFields,
} from '@/lib/worker-client'
import { prettyDocType } from './fr-format'

/**
 * Manual filter for the Federal Register spoke (brief #12).
 *
 * Axes: FTS + document type + agency (top agencies from facets) +
 * significant + open-for-comment + publication-date range + effective-date
 * range + CFR title/part + RIN. The open-for-comment checkbox is the
 * operative-fact filter — "what can I still weigh in on" — and the CFR
 * title/part pair answers "what actions touched 31 CFR 594".
 */
export function FrFilterForm({
  docTypes,
  agencies,
  loading,
  onSubmit,
  initialSearch,
}: {
  docTypes: readonly FrFacetCount[]
  agencies: readonly FrAgencyCount[]
  loading: boolean
  onSubmit: (fields: FrFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [docType, setDocType] = useState('')
  const [agencySlug, setAgencySlug] = useState('')
  const [significant, setSignificant] = useState(false)
  const [openForComment, setOpenForComment] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [cfrTitle, setCfrTitle] = useState('')
  const [cfrPart, setCfrPart] = useState('')
  const [rin, setRin] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: FrFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (docType) fields.docType = docType
    if (agencySlug) fields.agencySlug = agencySlug
    if (significant) fields.significant = true
    if (openForComment) fields.openForComment = true
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    if (effectiveFrom.trim()) fields.effectiveFrom = effectiveFrom.trim()
    if (effectiveTo.trim()) fields.effectiveTo = effectiveTo.trim()
    const t = Number(cfrTitle.trim())
    if (cfrTitle.trim() && Number.isFinite(t) && t > 0) fields.cfrTitle = t
    if (cfrPart.trim()) fields.cfrPart = cfrPart.trim()
    if (rin.trim()) fields.rin = rin.trim()
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setDocType('')
    setAgencySlug('')
    setSignificant(false)
    setOpenForComment(false)
    setFrom('')
    setTo('')
    setEffectiveFrom('')
    setEffectiveTo('')
    setCfrTitle('')
    setCfrPart('')
    setRin('')
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
          placeholder="e.g. sanctions, greenhouse gas, asylum eligibility"
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
        <Field label="Agency" hint="Top agencies by volume">
          <select
            value={agencySlug}
            onChange={(e) => setAgencySlug(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {agencies.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="RIN" hint="Regulation Identifier Number">
          <Input
            type="text"
            value={rin}
            onChange={(e) => setRin(e.target.value)}
            placeholder="e.g. 2060-AV09"
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <Field label="Effective from">
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Effective to">
          <Input
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            disabled={loading}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="CFR title" hint="e.g. 31">
          <Input
            type="text"
            inputMode="numeric"
            value={cfrTitle}
            onChange={(e) => setCfrTitle(e.target.value)}
            placeholder="e.g. 31"
            disabled={loading}
          />
        </Field>
        <Field label="CFR part" hint="e.g. 594">
          <Input
            type="text"
            inputMode="numeric"
            value={cfrPart}
            onChange={(e) => setCfrPart(e.target.value)}
            placeholder="e.g. 594"
            disabled={loading}
          />
        </Field>
        <CheckboxField
          label="Significant"
          hint="EO 12866 significant actions"
          checked={significant}
          onChange={setSignificant}
          disabled={loading}
        />
        <CheckboxField
          label="Open for comment"
          hint="Comment window still open"
          checked={openForComment}
          onChange={setOpenForComment}
          disabled={loading}
        />
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
